import { requireOperator } from "../../../../lib/auth.mjs";
import { scopedQuery } from "../../../../lib/store.mjs";
import { accessOutcome, indexPolicy, policyExpectation } from "../../../../policies/access-review/v1/semantics.mjs";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control":"no-store" };
const reply = (body, status = 200) => Response.json(body, {status, headers});

function mayApprove(operator) {
  if (!["oidc", "named"].includes(process.env.AUTH_MODE)) return false;
  try {
    const config = JSON.parse(process.env.POLICY_APPROVERS || "{}");
    const names = config[operator.organization_id];
    return Object.hasOwn(config, operator.organization_id) && Array.isArray(names) && names.includes(operator.name);
  } catch { return false; }
}

export async function POST(req) {
  const operator = await requireOperator(req);
  if (operator instanceof Response) return operator;
  if (!mayApprove(operator)) return reply({error:"Policy approval permission required"},403);
  if (req.headers.get("content-type")?.split(";")[0] !== "application/json") return reply({error:"JSON required"},415);
  let definition, effectiveAt;
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req.body || []) {
      size += chunk.length;
      if (size > 1024*1024) return reply({error:"Policy too large"},413);
      chunks.push(chunk);
    }
    ({definition, effectiveAt = null} = JSON.parse(Buffer.concat(chunks)));
    if (effectiveAt !== null) {
      if (typeof effectiveAt !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(effectiveAt))
        throw Error("Timezone required");
      effectiveAt = new Date(effectiveAt).toISOString();
    }
    if (typeof definition.source !== "string" || !definition.source.trim()) throw Error();
    indexPolicy(definition, definition.source, Date.parse(effectiveAt ?? new Date().toISOString()));
    // An approved definition must be evaluable at every instant, including future exception windows.
    const windows = new Map();
    for (const e of definition.exceptions ?? []) {
      const key = JSON.stringify([e.employeeId,e.businessRole,e.resource]);
      if (!windows.has(key)) windows.set(key,[]);
      windows.get(key).push([Date.parse(e.from), Date.parse(e.until)]);
    }
    for (const intervals of windows.values()) {
      intervals.sort((a,b)=>a[0]-b[0]);
      if (intervals.some(([start],i)=>i>0 && start<intervals[i-1][1])) throw Error();
    }
  } catch { return reply({error:"Invalid policy or effective date"},400); }
  try {
    const {rows} = await scopedQuery("assessment", operator.organization_id,
      `INSERT INTO policy_revisions (organization_id,source,policy_id,version,approved_by,effective_at,definition,evaluator_version)
       VALUES ($1,$2,$3,$4,$5,coalesce($6::timestamptz,statement_timestamp()),$7,'1.0.0')
       RETURNING policy_id,version,approved_by,approved_at,effective_at`,
      [operator.organization_id,definition.source,definition.id,definition.version,operator.name,effectiveAt,definition]);
    return reply(rows[0],201);
  } catch (err) {
    if (err.code === "23505") return reply({error:"Revision or effective date already registered"},409);
    if (err.code === "23514") return reply({error:"Effective date precedes approval"},400);
    throw err;
  }
}

export async function GET(req) {
  const operator = await requireOperator(req);
  if (operator instanceof Response) return operator;
  const read = (sql,params) => scopedQuery("assessment",operator.organization_id,sql,[operator.organization_id,...params]);
  const params = new URL(req.url).searchParams;
  if (params.has("source") && params.has("policy")) {
    const {rows} = await read(`SELECT definition FROM policy_revisions WHERE organization_id=$1 AND source=$2
      AND policy_id=$3 AND effective_at<=statement_timestamp() ORDER BY effective_at DESC LIMIT 1`,
      [params.get("source"),params.get("policy")]);
    return rows.length ? reply(rows[0].definition) : reply({error:"No effective revision"},404);
  }
  const id = params.get("review");
  if (id === null) return reply((await read(`SELECT source,policy_id,version,approved_by,approved_at,effective_at
    FROM policy_revisions WHERE organization_id=$1 ORDER BY source,policy_id,effective_at DESC`,[])).rows);
  const {rows} = await read(`SELECT r.report,r.observed_at>statement_timestamp() AS future_collection,p.definition,p.effective_at,p.approved_by,p.evaluator_version FROM access_reviews r
    LEFT JOIN LATERAL (SELECT * FROM policy_revisions WHERE organization_id=r.organization_id AND source=r.source
      AND policy_id=r.report->'policy'->>'id' AND effective_at<=r.observed_at ORDER BY effective_at DESC LIMIT 1) p ON true
    WHERE r.organization_id=$1 AND r.id=$2`,[id]);
  if (!rows.length) return reply({error:"Review unavailable"},404);
  const {report,definition,effective_at,approved_by} = rows[0];
  if (rows[0].future_collection) return reply({status:"FUTURE_COLLECTION"});
  if (!definition) return reply({status:"NO_EFFECTIVE_REVISION"});
  const policy = indexPolicy(definition,report.source,Date.parse(report.observedAt));
  const decisions = report.rows.map(row => {
    const applied = policyExpectation(policy,row.employeeId,row.businessRole,row.evidence.employment,JSON.stringify(row.resource));
    return {employeeId:row.employeeId, resource:row.resource, ...applied, observed:row.observed,
      recorded:row.outcome, replayed:accessOutcome(applied.expected,row.observed,applied.exception)};
  });
  return reply({status:"REPLAYED", policy:definition.id, recordedVersion:report.policy.version, effectiveVersion:definition.version,
    effectiveAt:effective_at, approvedBy:approved_by, evaluatorVersion:rows[0].evaluator_version, decisions});
}
