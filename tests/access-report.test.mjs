import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { validateAccessReport } from "../lib/access-review-contract.mjs";
import { buildAccessReport } from "../lib/access-report.mjs";

test("reviews current business roles, access paths, scoped exceptions and fresh revocation", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec("CREATE TABLE kyc(id int); CREATE ROLE employee1; CREATE ROLE readers; GRANT SELECT ON kyc TO readers; GRANT readers TO employee1");
  const query = (sql, args) => db.query(sql, args);
  const now = new Date("2026-11-25T09:00:00Z");
  const resource = ["public", "kyc"];
  const person = { id:"001", role:"employee1", businessRole:"Lending", status:"active" };
  const scope = { source:"loans", hrObserved:now.toISOString(), hrRevision:"42", resources:[resource], employees:[person] };
  const policy = { id:"KYC", version:"1", source:"loans", reviewer:"owner", reference:"SOP §4",
    datasets:[{ resource, classification:"restricted", roles:{ Lending:"read", Marketing:"none" } }] };
  const row = async () => {
    const report = await buildAccessReport(scope, policy, query, now);
    validateAccessReport(report);
    return report.rows[0];
  };
  assert.equal((await row()).outcome,"AS_EXPECTED");
  person.businessRole = "Marketing";
  const excess = await row();
  assert.equal(excess.outcome,"EXCESS_ACCESS");
  assert.deepEqual(excess.evidence.tableGrantPaths,[["employee1","readers"]]);
  policy.exceptions = [{employeeId:"001",businessRole:"Marketing",resource,approver:"owner",reference:"ticket-1",
    from:"2026-11-25T08:00:00Z",until:"2026-11-25T10:00:00Z"}];
  assert.equal((await row()).outcome,"APPROVED_EXCEPTION");
  person.status = "terminated";
  assert.equal((await row()).outcome,"EXCESS_ACCESS");
  person.status = "active";
  policy.exceptions[0].until = now.toISOString();
  assert.equal((await row()).outcome,"EXCESS_ACCESS");
  await db.exec("REVOKE readers FROM employee1");
  assert.equal((await row()).outcome,"AS_EXPECTED");
  person.businessRole = "Lending";
  assert.equal((await row()).outcome,"MISSING_EXPECTED_GRANT");
  person.businessRole = "Unknown";
  assert.equal((await row()).outcome,"INSUFFICIENT_EVIDENCE");
  person.businessRole = "Marketing";
  scope.hrObserved = "2026-11-01T09:00:00Z";
  assert.equal((await row()).outcome,"INSUFFICIENT_EVIDENCE");
  policy.source = "other";
  await assert.rejects(row,/policy or source/);
});
