import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { postgresConnector } from "../connectors/postgres/index.mjs";
import {
  parseAssessment,
  contractVersion,
} from "../packages/connector-sdk/contract.mjs";
import { latest } from "../lib/store.mjs";

test("connector snapshots, historical backfill and graph reader preserve scoped grant evidence", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  process.env.DATABASE_URL = "postgres://localhost/unused";
  t.mock.method(pg.Pool.prototype, "query", (sql, args) => db.query(sql, args));
  t.mock.method(pg.Pool.prototype, "connect", async () => ({query: (sql,args) => db.query(sql,args), release() {}}));
  const apply = (name) =>
    db.exec(readFileSync("migrations/" + name + ".sql", "utf8"));
  await apply("001-assurance");
  await db.exec(
    "CREATE ROLE staff; CREATE ROLE team_a; CREATE ROLE team_b; CREATE TABLE customer(id int); GRANT SELECT ON customer TO team_a,team_b; GRANT team_a,team_b TO staff",
  );
  const connector = postgresConnector((sql, args) => db.query(sql, args));
  const now = Date.now(),
    feed = {
      source: "private",
      hrObserved: new Date(now).toISOString(),
      hrRevision: "1",
      employees: [{ id: "e1", role: "staff", status: "terminated" }],
      resources: [["public", "customer"]],
    };
  let offset = 0;
  async function persist(batch) {
    await db.query(
      "INSERT INTO assessments(id,source,collected_at,policy_version) VALUES($1,$2,$3,$4)",
      [batch.id, batch.source, batch.observed, batch.policy],
    );
    const r = batch.results[0];
    await db.query("INSERT INTO assessment_results VALUES($1,$2,$3,$4,$5,$6)", [
      batch.id,
      r.employeeId,
      r.role,
      r.resource,
      r.decision,
      r.evidence,
    ]);
  }
  async function collect() {
    return connector.collect(feed, new Date(now + offset++));
  }
  const original = await collect();
  assert.equal(original.contractVersion, contractVersion);
  const { contractVersion: version, ...legacy } = original;
  assert.equal(parseAssessment(legacy).contractVersion, version);
  assert.throws(() =>
    parseAssessment({ ...original, contractVersion: "future" }),
  );
  await persist(original);
  await apply("007-access-graph");
  await apply("007-access-graph");
  for (const name of ["002-identities","004-collection-alerts","005-webhook-outbox","008-organizations","009-alert-organizations","012-assessment-rls"]) await apply(name);
  await db.exec("INSERT INTO organizations VALUES ('other')");
  const check = async (batch) => {
    const [run] = await latest();
    const result = run.results[0];
    assert.equal(run.id, batch.id);
    assert.deepEqual(result.evidence.observations, batch.results[0].evidence.observations);
    assert.equal(result.decision, batch.results[0].decision);
    assert.deepEqual(
      result.projected_paths,
      batch.results[0].evidence.tableGrantPaths ?? null,
    );
  };
  await check(original);
  assert.equal(original.results[0].evidence.tableGrantPaths.length, 2);
  await db.exec("REVOKE team_a FROM staff");
  const partial = await collect();
  await persist(partial);
  await check(partial);
  assert.equal(partial.results[0].decision, "RETAINED");
  await db.exec("REVOKE team_b FROM staff");
  const removed = await collect();
  await persist(removed);
  await check(removed);
  assert.equal(removed.results[0].decision, "NO_SCOPED_GRANT");
  const failed = await postgresConnector(() => {
    throw Error();
  }).collect(feed, new Date(now + offset++));
  await persist(failed);
  await check(failed);
  assert.equal(failed.results[0].decision, "UNKNOWN");
  const old = await collect();
  delete old.results[0].evidence.tableGrantPaths;
  await persist(old);
  await check(old);
  const { rows } = await db.query(
    "SELECT source,organization_id FROM access_graph_entities",
  );
  assert.ok(
    rows.every(
      (r) => r.source === "private" && r.organization_id === "installation",
    ),
  );
  const other = await collect();
  await db.query(
    "INSERT INTO assessments(id,organization_id,source,collected_at,policy_version) VALUES($1,'other',$2,$3,$4)",
    [other.id, other.source, other.observed, other.policy],
  );
  await db.query(
    "INSERT INTO assessment_results VALUES($1,'e1','staff','resource','NO_SCOPED_GRANT','{}')",
    [other.id],
  );
  const { rows: owners } = await db.query(
    "SELECT organization_id FROM access_graph_entities WHERE kind='person' AND external_id='e1' ORDER BY organization_id",
  );
  assert.deepEqual(
    owners.map((o) => o.organization_id),
    ["installation", "other"],
  );
  await assert.rejects(
    db.query(
      "INSERT INTO access_graph_edges VALUES('installation','private',$1,'e1','resource',7,1,'CAN_READ','role','staff','relation','resource')",
      [other.id],
    ),
    /foreign key/i,
  );
});
