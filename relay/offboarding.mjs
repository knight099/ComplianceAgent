import { randomUUID } from "node:crypto";
export const policy = "hr.postgres.offboarding/v1";
// Catalog-only check. A reachable SET ROLE can retain access even after login inheritance is revoked.
export const privilegeQuery = `
WITH target AS (SELECT c.oid,c.relowner,c.relacl FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname=$2 AND c.relname=$3 AND c.relkind IN ('r','p')),
 principal AS (SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1),
 reachable AS (SELECT r.oid,r.rolname FROM pg_catalog.pg_roles r,principal p
 WHERE r.oid=p.oid OR pg_catalog.pg_has_role(p.oid,r.oid,'SET'))
SELECT EXISTS(SELECT FROM target) AS resource_known, EXISTS(SELECT FROM principal) AS identity_known,
 ARRAY(SELECT r.rolname FROM reachable r,target t WHERE pg_catalog.has_any_column_privilege(r.oid,t.oid,'SELECT') ORDER BY r.rolname) AS readable_as,
 ARRAY(SELECT DISTINCT coalesce(g.rolname,'PUBLIC') FROM target t CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(t.relacl,pg_catalog.acldefault('r',t.relowner))) a
 LEFT JOIN pg_catalog.pg_roles g ON g.oid=a.grantee WHERE a.privilege_type='SELECT' AND (a.grantee=0 OR EXISTS(SELECT FROM reachable r WHERE pg_catalog.pg_has_role(r.oid,a.grantee,'USAGE')))) AS grantees`;
export async function assess(feed, query, now = new Date()) {
  const text = (x) => typeof x === "string" && x.trim().length > 0;
  if (
    !text(feed.source) ||
    !text(feed.hrRevision) ||
    !Number.isFinite(Date.parse(feed.hrObserved)) ||
    !Array.isArray(feed.employees) ||
    !Array.isArray(feed.resources) ||
    !feed.resources.length
  )
    throw Error("Invalid assessment scope");
  const ids = new Set(),
    roles = new Map(),
    resources = new Set();
  for (const r of feed.resources) {
    if (
      !Array.isArray(r) ||
      r.length !== 2 ||
      !r.every(text) ||
      resources.has(JSON.stringify(r))
    )
      throw Error("Invalid or duplicate resource");
    resources.add(JSON.stringify(r));
  }
  for (const e of feed.employees) {
    if (
      !text(e.id) ||
      ids.has(e.id) ||
      !["active", "terminated"].includes(e.status) ||
      (e.role != null && !text(e.role))
    )
      throw Error("Invalid or duplicate employee");
    ids.add(e.id);
    roles.set(e.role, (roles.get(e.role) || 0) + 1);
  }
  const results = [];
  for (const employee of feed.employees.filter(
    (e) => e.status === "terminated",
  )) {
    for (const [schema, table] of feed.resources) {
      let decision = "UNKNOWN";
      const evidence = {
        hrRevision: feed.hrRevision,
        hrObserved: feed.hrObserved,
        employment: employee.status,
        schema,
        table,
      };
      const age = now.getTime() - Date.parse(feed.hrObserved);
      if (age < 0 || age > 86400000)
        evidence.reason = "HR evidence outside freshness window";
      else if (!employee.role || roles.get(employee.role) !== 1)
        evidence.reason = "Missing or ambiguous identity mapping";
      else
        try {
          const {
            rows: [fact],
          } = await query(privilegeQuery, [employee.role, schema, table]);
          if (!fact?.resource_known || !fact.identity_known)
            evidence.reason = "Resource or mapped role unavailable";
          else {
            decision = fact.readable_as.length ? "RETAINED" : "NO_SCOPED_GRANT";
            Object.assign(evidence, {
              readableAs: fact.readable_as,
              tableGrantees: fact.grantees,
            });
          }
        } catch {
          evidence.reason = "PostgreSQL collection failed";
        }
      results.push({
        employeeId: employee.id,
        role: employee.role || "",
        resource: JSON.stringify([schema, table]),
        decision,
        evidence,
      });
    }
  }
  return {
    id: randomUUID(),
    source: feed.source,
    policy,
    observed: now.toISOString(),
    results,
  };
}
