import { assessmentIdentities } from "./identity-links.mjs";
import pg from "pg";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
let pool;
export function database() {
  if (!process.env.DATABASE_URL) throw Error("DATABASE_URL is required");
  return (pool ??= new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  }));
}
export async function migrate() {
  for (const file of [
    "001-assurance.sql",
    "002-identities.sql",
    "003-operator-permissions.sql",
    "004-collection-alerts.sql",
    "005-webhook-outbox.sql",
    "006-delivery-status.sql",
    "007-access-graph.sql",
    "008-organizations.sql",
    "009-alert-organizations.sql",
    "010-evidence-organizations.sql",
    "011-evidence-rls.sql",
    "012-assessment-rls.sql",
    "013-monitoring-rls.sql",
    "014-health-reader.sql",
    "015-identity-lookup.sql",
    "016-access-reviews.sql",
  ])
    await database().query(readFileSync("migrations/" + file, "utf8"));
}
const roles = {
  evidence: "SET LOCAL ROLE complyos_evidence",
  assessment: "SET LOCAL ROLE complyos_assessment",
  monitor: "SET LOCAL ROLE complyos_monitor",
  alertReader: "SET LOCAL ROLE complyos_alert_reader",
  delivery: "SET LOCAL ROLE complyos_delivery",
};
export async function organizationTransaction(scope, organization, work) {
  if (typeof organization !== "string" || !organization.trim())
    throw Error("Transaction requires an organization");
  const client = await database().connect();
  let discard = false;
  try {
    await client.query("BEGIN");
    await client.query(roles[scope]);
    await client.query("SELECT set_config('complyos.organization_id',$1,true)", [organization]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      discard = true;
    }
    throw error;
  } finally {
    client.release(discard);
  }
}
export function scopedQuery(scope, organization, sql, params) {
  return organizationTransaction(scope, organization, client => client.query(sql, params));
}
export async function saveEvidence(e, organization) {
  const id = createHash("sha256").update(JSON.stringify(e)).digest("hex");
  await scopedQuery("evidence", organization,
    "INSERT INTO collected_evidence(id,observation,organization_id) VALUES($1,$2,$3) ON CONFLICT (organization_id,id) DO NOTHING",
    [id, e, organization],
  );
  return id;
}
export async function evidenceById(id, organization) {
  const { rows } = await scopedQuery("evidence", organization,
    "SELECT id, observation, received_at FROM collected_evidence WHERE organization_id=$1 AND id=$2",
    [organization, id],
  );
  return rows[0];
}
export async function saveAssessment(a, submittedBy, organization) {
  return organizationTransaction("assessment", organization, async client => {
    const inserted = await client.query(
      "INSERT INTO assessments(id,source,collected_at,policy_version,submitted_by,organization_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id",
      [a.id, a.source, a.observed, a.policy, submittedBy, organization],
    );
    if (!inserted.rowCount) {
      const retry = await client.query(
        "SELECT id FROM assessments WHERE id=$1 AND source=$2 AND organization_id=$3",
        [a.id, a.source, organization],
      );
      return Boolean(retry.rowCount);
    }
    for (const r of a.results) {
      await client.query(
        "INSERT INTO assessment_results VALUES($1,$2,$3,$4,$5,$6)",
        [a.id, r.employeeId, r.role, r.resource, r.decision, r.evidence],
      );
    }
    return true;
  });
}
export async function latest(organization = "installation") {
  return (
    await scopedQuery("assessment", organization,
      `WITH current_runs AS (
         SELECT DISTINCT ON (source) * FROM assessments
         WHERE organization_id = $1
         ORDER BY source,collected_at DESC,received_at DESC,id DESC
       )
       SELECT a.*, coalesce(rows.results,'[]'::jsonb) AS results
       FROM current_runs a LEFT JOIN LATERAL (
         SELECT jsonb_agg(
           (to_jsonb(r)-'assessment_id') || jsonb_build_object('projected_paths',
             CASE WHEN jsonb_typeof(r.evidence->'tableGrantPaths')='array'
                  THEN coalesce(p.paths,'[]'::jsonb) END)
           ORDER BY r.employee_id,r.resource
         ) AS results
         FROM assessment_results r LEFT JOIN projected_grant_paths p
           USING(assessment_id,employee_id,resource)
         WHERE r.assessment_id=a.id
       ) rows ON true ORDER BY a.collected_at DESC`, [organization],
    )
  ).rows.map(run => ({ ...run, identities: assessmentIdentities(organization, run.source, run.results) }));
}

export async function assessmentCounts(id, organization) {
  const result = await scopedQuery("assessment", organization,
    `SELECT a.collected_at,
 now()-a.collected_at > interval '24 hours' AS stale,
 count(*) FILTER(WHERE r.decision='RETAINED')::int AS retained,
 count(*) FILTER(WHERE r.decision='UNKNOWN')::int AS unknown,
 count(*) FILTER(WHERE r.decision='NO_SCOPED_GRANT')::int AS no_scoped_grant
 FROM assessments a LEFT JOIN assessment_results r ON r.assessment_id=a.id
 WHERE a.id=$1 AND a.organization_id=$2 GROUP BY a.id`,
    [id, organization],
  );
  return result.rows[0];
}

export async function assessmentHistory(source, ids, organization) {
  if (!ids.length)
    return (
      await scopedQuery("assessment", organization,
        "SELECT id,collected_at,policy_version FROM assessments WHERE source=$1 AND organization_id=$2 ORDER BY collected_at DESC,id DESC",
        [source, organization],
      )
    ).rows;
  return (
    await scopedQuery("assessment", organization,
      `SELECT a.*,coalesce(jsonb_agg(to_jsonb(r)-'assessment_id' ORDER BY r.employee_id,r.resource) FILTER (WHERE r.employee_id IS NOT NULL),'[]') AS results
 FROM assessments a LEFT JOIN assessment_results r ON a.id=r.assessment_id WHERE a.source=$1 AND a.id=ANY($2::uuid[]) AND a.organization_id=$3 GROUP BY a.id`,
      [source, ids, organization],
    )
  ).rows;
}
