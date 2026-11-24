import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { assess } from "../relay/offboarding.mjs";
const feed = () => ({
  source: "finance-db",
  hrRevision: "42",
  hrObserved: new Date().toISOString(),
  resources: [["public", "restricted"]],
  employees: [
    { id: "e1", name: "Lee", role: "employee_one", status: "terminated" },
    { id: "e2", name: "Lee", role: "employee_two", status: "terminated" },
  ],
});
test("PostgreSQL role graph distinguishes inherited access, absence and fresh revocation", async () => {
  const db = new PGlite();
  try {
    const migration = readFileSync("migrations/001-assurance.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration);
    await db.exec(
      "CREATE ROLE employee_one; CREATE ROLE employee_two; CREATE ROLE readers; CREATE TABLE restricted (id int); GRANT SELECT ON restricted TO readers; GRANT readers TO employee_one",
    );
    const inspect = () => assess(feed(), (s, p) => db.query(s, p));
    const first = await inspect();
    assert.deepEqual(
      first.results.map((r) => r.decision),
      ["RETAINED", "NO_SCOPED_GRANT"],
    );
    assert.deepEqual(first.results[0].evidence.tableGrantees, ["readers"]);
    await db.exec("REVOKE readers FROM employee_one");
    assert.equal((await inspect()).results[0].decision, "NO_SCOPED_GRANT");
  } finally {
    await db.close();
  }
});
test("failed observation or ambiguous identity requires review", async () => {
  const f = feed();
  const failed = await assess(f, () => {
    throw Error();
  });
  assert.ok(failed.results.every((r) => r.decision === "UNKNOWN"));
  f.employees[1].role = f.employees[0].role;
  const duplicate = await assess(f, () =>
    assert.fail("should skip ambiguous roles"),
  );
  assert.match(duplicate.results[0].evidence.reason, /ambiguous/);
});
