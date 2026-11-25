import { randomUUID } from "node:crypto";
import { postgresPolicy as policy } from "../packages/connector-sdk/contract.mjs";
export { policy };
// Catalog-only check. A reachable SET ROLE can retain access even after login inheritance is revoked.
export const privilegeQuery = `
WITH RECURSIVE target AS (SELECT c.oid,c.relowner,c.relacl FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname=$2 AND c.relname=$3 AND c.relkind IN ('r','p')),
 principal AS (SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1),
 reachable AS (SELECT r.oid,r.rolname FROM pg_catalog.pg_roles r,principal p
 WHERE r.oid=p.oid OR pg_catalog.pg_has_role(p.oid,r.oid,'SET')),
 table_acl AS (
 SELECT DISTINCT a.grantee FROM target t
 CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(t.relacl,pg_catalog.acldefault('r',t.relowner))) a
 WHERE a.privilege_type='SELECT'
 ),
 -- Follow zero or more SET edges, then zero or more inherited edges.
 walk(id,roles,ids,set_chain,inherit_chain) AS (
 SELECT r.oid, ARRAY[r.rolname::text], ARRAY[r.oid], true, true
 FROM pg_catalog.pg_roles r JOIN principal p ON p.oid=r.oid
 UNION ALL
 SELECT g.oid, w.roles || g.rolname::text, w.ids || g.oid,
        w.set_chain AND m.set_option, (w.set_chain OR w.inherit_chain) AND m.inherit_option
 FROM walk w JOIN pg_catalog.pg_auth_members m ON m.member=w.id
 JOIN pg_catalog.pg_roles g ON g.oid=m.roleid
 WHERE NOT g.oid=ANY(w.ids) AND cardinality(w.ids)<9
 AND ((w.set_chain AND m.set_option) OR ((w.set_chain OR w.inherit_chain) AND m.inherit_option))
 ),
 sampled AS MATERIALIZED (SELECT * FROM walk LIMIT 513),
 witnesses AS (
 SELECT DISTINCT w.roles FROM sampled w JOIN table_acl a ON a.grantee=w.id
 UNION SELECT ARRAY[p.rolname::text,'PUBLIC'] FROM pg_catalog.pg_roles p
 JOIN principal ON principal.oid=p.oid WHERE EXISTS(SELECT FROM table_acl WHERE grantee=0)
 )
SELECT EXISTS(SELECT FROM target) AS resource_known, EXISTS(SELECT FROM principal) AS identity_known,
 ARRAY(SELECT r.rolname FROM reachable r,target t WHERE pg_catalog.has_any_column_privilege(r.oid,t.oid,'SELECT') ORDER BY r.rolname) AS readable_as,
 ARRAY(SELECT DISTINCT coalesce(g.rolname,'PUBLIC') FROM table_acl a
 LEFT JOIN pg_catalog.pg_roles g ON g.oid=a.grantee WHERE (a.grantee=0 OR EXISTS(SELECT FROM reachable r WHERE pg_catalog.pg_has_role(r.oid,a.grantee,'USAGE')))) AS grantees,
 (SELECT coalesce(jsonb_agg(roles ORDER BY roles),'[]'::jsonb)
 FROM (SELECT roles FROM witnesses ORDER BY roles LIMIT 32) shown) AS paths,
 ((SELECT count(*) FROM sampled)>=513 OR EXISTS(SELECT FROM sampled WHERE cardinality(ids)=9)
 OR (SELECT count(*) FROM witnesses)>32) AS path_limit_reached`;
export async function assess(feed, query, now = new Date(), directory) {
  const results = await collectReadPrivileges(feed, query, now, directory, true);
  return { id: randomUUID(), source: feed.source, policy, observed: now.toISOString(), results };
}

export async function collectReadPrivileges(feed, query, now, directory, terminatedOnly = false) {
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
  for (const employee of feed.employees) {
    if (terminatedOnly && employee.status !== "terminated") continue;
    for (const [schema, table] of feed.resources) {
      let decision = "UNKNOWN";
      const evidence = {
        hrRevision: feed.hrRevision,
        hrObserved: feed.hrObserved,
        employment: employee.status,
        schema,
        table,
      };
      if (directory) evidence.directory = directory.get(employee.id);
      const age = now.getTime() - Date.parse(feed.hrObserved);
      if (age < 0 || age > 86400000)
        evidence.reason = "HR evidence outside freshness window";
      else if (directory && evidence.directory?.status !== "matched")
        evidence.reason = "Entra identity mapping " + (evidence.directory?.status ?? "unavailable");
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
              tableGrantPaths: fact.paths,
              pathLimitReached: fact.path_limit_reached,
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
  return results;
}
