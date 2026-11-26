import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database, migrate, saveAssessment, latest, assessmentCounts, assessmentHistory,
  organizationTransaction } from "../../lib/store.mjs";
import { sweep, alerts } from "../../lib/collection-alerts.mjs";

test("simultaneous organizations isolate assessment rows, graph views and monitor reads", async t => {
  if (!process.env.COMPLYOS_TEST_DATABASE_URL) throw Error("Provide COMPLYOS_TEST_DATABASE_URL");
  process.env.DATABASE_URL = process.env.COMPLYOS_TEST_DATABASE_URL;
  const pool = database();
  t.after(() => pool.end());
  await migrate();
  const orgs = ["rls-east", "rls-west"];
  await pool.query("INSERT INTO organizations VALUES ($1), ($2)", orgs);
  const runs = orgs.map(org => ({
    id: randomUUID(), source: "payroll", policy: "v1", observed: new Date(0).toISOString(),
    results: [{employeeId: org, role: "staff", resource: "payroll", decision: "RETAINED",
      evidence: {tableGrantPaths: [["staff"]]}}],
  }));
  await Promise.all(orgs.map((org,i) => saveAssessment(runs[i], "relay", org)));
  await migrate(); // Replay with projected historical rows already present.
  await Promise.all(orgs.map(async (org,i) => {
    assert.equal(await saveAssessment(runs[i], "relay", org), true);
    assert.equal(await saveAssessment(runs[1-i], "relay", org), false);
    assert.equal((await latest(org))[0].results[0].employee_id, org);
    assert.equal(await assessmentCounts(runs[1-i].id, org), undefined);
    assert.equal((await assessmentHistory("payroll", [], org)).length, 1);
    await sweep("https://example.invalid/test", org);
    assert.equal((await alerts(pool,org)).open[0].last_assessment, runs[i].id);
  }));
  // Keep both sessions open until both have installed their transaction-local context.
  let count = 0, ready;
  const bothReady = new Promise(resolve => { ready = resolve; });
  await Promise.all(orgs.map((org,i) => organizationTransaction("assessment",org,async client => {
    if (++count === 2) ready();
    await bothReady;
    for (const [table, column, value] of [
      ["assessments","organization_id",org], ["assessment_results","employee_id",org],
      ["access_graph_edges","organization_id",org], ["access_graph_entities","organization_id",org],
      ["projected_grant_paths","assessment_id",runs[i].id],
    ]) {
      assert.deepEqual((await client.query(`SELECT DISTINCT ${column} AS owner FROM ${table}`)).rows, [{owner:value}]);
    }
    await client.query("SAVEPOINT before_foreign_insert");
    await assert.rejects(client.query("INSERT INTO assessment_results VALUES ($1,'foreign','r','s','UNKNOWN','{}')",
      [runs[1-i].id]), {code:"42501"});
    await client.query("ROLLBACK TO before_foreign_insert");
  })));
});
