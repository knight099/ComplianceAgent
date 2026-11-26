import assert from "node:assert/strict";
import test from "node:test";
import { assess } from "../relay/offboarding.mjs";
import { assessmentIdentities } from "../lib/identity-links.mjs";

async function rows() {
  const now = new Date();
  const run = await assess({
    source: "db", hrRevision: "hr-1", hrObserved: now.toISOString(),
    employees: [{ id: "E1", role: "r1", status: "terminated" }],
    resources: [["public", "one"], ["public", "two"]],
  }, async () => ({ rows: [{ resource_known: true, identity_known: true, readable_as: [], paths: [], grantees: [] }] }),
  now, new Map([["E1", { status: "matched", accountId: "a1", observed: now.toISOString() }]]));
  return run.results.map(r => ({ employee_id: r.employeeId, role_name: r.role, evidence: r.evidence }));
}

test("one source-scoped identity across resources and runs, with dated provenance", async () => {
  const records = await rows();
  const [id] = assessmentIdentities("tenant", "db", records);
  assert.deepEqual(id.links.map(x => x.account), ["E1", "a1", "r1"]);
  assert.ok(id.links.every(x => x.observedAt && x.source));
  assert.deepEqual(id.review, []);
  assert.equal(assessmentIdentities("tenant", "db", await rows())[0].key, id.key);
  assert.notEqual(assessmentIdentities("other", "db", records)[0].key, id.key);
  assert.notEqual(assessmentIdentities("tenant", "other", records)[0].key, id.key);
});

test("shared accounts and roles are withheld, legacy evidence requires review", async () => {
  const [r] = await rows();
  const other = structuredClone(r);
  other.employee_id = "E2";
  for (const o of other.evidence.observations) o.subject = "E2";
  other.evidence.observations[0].target = "E2";
  for (const id of assessmentIdentities("tenant", "db", [r, other])) {
    assert.deepEqual(id.links.map(x => x.system), ["HR"]);
    assert.equal(id.review.length, 2);
  }
  delete r.evidence.observations;
  const [legacy] = assessmentIdentities("tenant", "db", [r]);
  assert.deepEqual(legacy.links, []);
  assert.ok(legacy.review.length);
});
