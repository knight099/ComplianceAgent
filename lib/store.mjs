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
  await database().query(readFileSync("migrations/001-assurance.sql", "utf8"));
}
export async function saveEvidence(e) {
  const id = createHash("sha256").update(JSON.stringify(e)).digest("hex");
  await database().query(
    "INSERT INTO collected_evidence(id,observation) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [id, e],
  );
  return id;
}
export async function saveAssessment(a) {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      "INSERT INTO assessments(id,source,collected_at,policy_version) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id",
      [a.id, a.source, a.observed, a.policy],
    );
    if (inserted.rowCount)
      for (const r of a.results)
        await client.query(
          "INSERT INTO assessment_results VALUES($1,$2,$3,$4,$5,$6)",
          [a.id, r.employeeId, r.role, r.resource, r.decision, r.evidence],
        );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export async function latest() {
  return (
    await database().query(
      `SELECT a.*,coalesce(jsonb_agg(to_jsonb(r)-'assessment_id' ORDER BY r.employee_id,r.resource) FILTER (WHERE r.employee_id IS NOT NULL),'[]') AS results FROM assessments a LEFT JOIN assessment_results r ON a.id=r.assessment_id WHERE a.id IN (SELECT DISTINCT ON(source) id FROM assessments ORDER BY source,collected_at DESC,received_at DESC) GROUP BY a.id ORDER BY a.collected_at DESC`,
    )
  ).rows;
}
