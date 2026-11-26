import test from "node:test";
import assert from "node:assert/strict";
import { postgresConnector } from "../connectors/postgres/index.mjs";
import { parseAssessment } from "../packages/connector-sdk/contract.mjs";

const now = new Date("2026-10-01T12:00:00Z");
const feed = {
  source: "private-db", hrRevision: "export-7", hrObserved: now.toISOString(),
  employees: [{ id: "e1", role: "reader", status: "terminated" }], resources: [["customer", "records"]],
};

test("catalog provenance distinguishes incomplete paths, failed reads and checks skipped for stale HR", async () => {
  const limited = postgresConnector(async () => ({ rows: [{
    resource_known: true, identity_known: true, readable_as: ["reader"], paths: [], path_limit_reached: true,
  }] }));
  const batch = await limited.collect(feed, now);
  const record = batch.results[0].evidence.observations.at(-1);
  assert.deepEqual(record, {
    version: "complyos.observation/v1", subject: "e1", kind: "postgres.catalog-select",
    source: feed.source, target: JSON.stringify(feed.resources[0]), observedAt: now.toISOString(),
    coverage: "partial", value: "RETAINED",
  });
  const failed = await postgresConnector(async () => { throw Error(); }).collect(feed, now);
  assert.equal(failed.results[0].evidence.observations.at(-1).coverage, "unavailable");
  const stale = await postgresConnector(assert.fail).collect({...feed, hrObserved:"2026-09-20T12:00:00Z"}, now);
  assert.deepEqual(stale.results[0].evidence.observations.map(o => o.coverage), ["stale", "skipped"]);
  for (const override of [{target:"wrong"}, {subject:"other"}, {version:"future"}, {coverage:"skipped"},
    {source:"other"}, {value:"NO_SCOPED_GRANT"}, {observedAt:null}]) {
    const invalid = structuredClone(batch);
    Object.assign(invalid.results[0].evidence.observations.at(-1), override);
    assert.throws(() => parseAssessment(invalid));
  }
  delete batch.results[0].evidence.observations;
  assert.equal(parseAssessment(batch).results[0].decision, "RETAINED");
});
