import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readHrInput } from "../connectors/hr/input.mjs";
import { collectDirectoryMatches } from "../connectors/entra/index.mjs";
import { postgresConnector } from "../connectors/postgres/index.mjs";

const now = new Date();
const scope = {
  source: "database-one", hrObserved: now.toISOString(), hrRevision: "rev-1",
  resources: [["customer", "identity"]],
};
const employee = { id: "001", role: "role,one", status: "terminated" };
const query = async () => ({ rows: [{
  resource_known: true, identity_known: true, readable_as: ["role,one"],
  grantees: ["role,one"], paths: [["role,one"]], path_limit_reached: false,
}] });

test("CSV and JSON input produce equivalent connector assessments", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "hr-input-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const csv = join(dir, "employees.csv"), meta = join(dir, "scope.json");
  const json = join(dir, "employees.json");
  await writeFile(meta, JSON.stringify({ ...scope, columns: { id: "Worker", role: "DB", status: "State" } }));
  await writeFile(json, JSON.stringify({ ...scope, employees: [employee] }));
  const header = "\uFEFFWorker,State,DB\r\n";
  const row = '001,terminated,"role,one"\r\n';
  await writeFile(csv, header + row);
  const read = async (file, config) => postgresConnector(query).collect(await readHrInput(file, config), now);
  const { results } = await read(csv, meta);
  assert.deepEqual(results, (await read(json)).results);
  assert.equal(results[0].decision, "RETAINED");
  assert.equal(results[0].employeeId, "001");
  await writeFile(csv, header + row + row);
  await assert.rejects(read(csv, meta), /duplicate employee/);
  await writeFile(csv, header + row + '002,active,"role,one"\n003,terminated,\n');
  assert.deepEqual((await read(csv, meta)).results.map(r => r.decision), ["UNKNOWN", "UNKNOWN"]);
  await writeFile(csv, "Worker,DB\n001,a\n");
  await assert.rejects(read(csv, meta), /header/);
});

test("directory match requires a complete unique employee ID across pages", async () => {
  const next = "https://graph.microsoft.com/v1.0/users?$skiptoken=next";
  const user = { id: "account-1", employeeId: employee.id };
  const feed = { ...scope, employees: [employee] };
  for (const [pages, status] of [
    [[{ value: [user], "@odata.nextLink": next }, { value: [user] }], "matched"],
    [[{ value: [user], "@odata.nextLink": next }, { value: [{ ...user, id: "other" }] }], "ambiguous"],
    [[{ value: [] }], "unmatched"],
    [[{ value: [user], "@odata.nextLink": next }, null], "unavailable"],
    [[{ value: [user], "@odata.nextLink": "https://example.org/page" }], "unavailable"],
  ]) {
    const directory = await collectDirectoryMatches(feed.employees, "mock", async (url, options) => {
      assert.equal(url.origin, "https://graph.microsoft.com");
      assert.equal(options.redirect, "error");
      const page = pages.shift();
      return page ? Response.json(page) : new Response(null, { status: 429 });
    });
    const connector = postgresConnector(status === "matched" ? query : assert.fail, directory);
    const [result] = (await connector.collect(feed, now)).results;
    const [hr, entra, pg] = result.evidence.observations;
    assert.deepEqual([hr.source, hr.observedAt, hr.value], [scope.hrRevision, scope.hrObserved, employee.status]);
    assert.equal(entra.observedAt, directory.get(employee.id).observed);
    assert.equal(entra.value, status === "unavailable" ? null : status);
    assert.equal(pg.coverage, status === "matched" ? "observed" : "skipped");
    assert.equal(pg.observedAt, status === "matched" ? now.toISOString() : null);
    assert.equal(result.evidence.directory.status, status);
    assert.equal(result.evidence.directory.accountId, status === "matched" ? user.id : undefined);
    assert.equal(result.decision, status === "matched" ? "RETAINED" : "UNKNOWN");
  }
});

test("CSV imports the current business role separately from the database login", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "hr-transfer-"));
  t.after(() => rm(dir, {recursive:true, force:true}));
  const csv = join(dir, "transfer.csv"), config = join(dir, "scope.json");
  await writeFile(csv, "Worker,Employment,Login,Department\n001,active,analyst1,Marketing\n");
  await writeFile(config, JSON.stringify({...scope, columns:{
    id:"Worker", status:"Employment", role:"Login", businessRole:"Department",
  }}));
  assert.deepEqual((await readHrInput(csv, config)).employees, [
    {id:"001", status:"active", role:"analyst1", businessRole:"Marketing"},
  ]);
});
