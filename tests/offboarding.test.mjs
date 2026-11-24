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

test("independent paths survive partial revocation and respect membership options", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE restricted (id int); CREATE ROLE employee_one; CREATE ROLE lending; CREATE ROLE reviews; CREATE ROLE readers; CREATE ROLE blocked;
 GRANT SELECT ON restricted TO readers,blocked;
 GRANT readers TO lending,reviews;
 GRANT lending,reviews TO employee_one;
 GRANT blocked TO employee_one WITH INHERIT FALSE, SET FALSE;`);
    const f = feed();
    f.employees = f.employees.slice(0, 1);
    const read = async () =>
      (await assess(f, (sql, p) => db.query(sql, p))).results[0];
    const initial = await read();
    assert.deepEqual(initial.evidence.tableGrantPaths, [
      ["employee_one", "lending", "readers"],
      ["employee_one", "reviews", "readers"],
    ]);
    await db.exec("REVOKE lending FROM employee_one");
    const remaining = await read();
    assert.equal(remaining.decision, "RETAINED");
    assert.deepEqual(remaining.evidence.tableGrantPaths, [
      ["employee_one", "reviews", "readers"],
    ]);
    await db.exec(
      "REVOKE reviews FROM employee_one; GRANT SELECT (id) ON restricted TO employee_one",
    );
    const column = await read();
    assert.equal(column.decision, "RETAINED");
    assert.deepEqual(column.evidence.tableGrantPaths, []);
    await db.exec("GRANT SELECT ON restricted TO PUBLIC");
    assert.deepEqual((await read()).evidence.tableGrantPaths, [
      ["employee_one", "PUBLIC"],
    ]);
  } finally {
    await db.close();
  }
});

test("a SET-only membership can precede inheritance but cannot follow inheritance alone", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE restricted (id int); CREATE ROLE employee_one; CREATE ROLE intermediate; CREATE ROLE readers;
 GRANT SELECT ON restricted TO readers;
 GRANT intermediate TO employee_one WITH INHERIT FALSE, SET TRUE;
 GRANT readers TO intermediate WITH INHERIT TRUE, SET FALSE`);
    const f = feed();
    f.employees = f.employees.slice(0, 1);
    const read = async () =>
      (await assess(f, (sql, p) => db.query(sql, p))).results[0];
    assert.deepEqual((await read()).evidence.tableGrantPaths, [
      ["employee_one", "intermediate", "readers"],
    ]);
    await db.exec(`GRANT intermediate TO employee_one WITH INHERIT TRUE, SET FALSE;
 GRANT readers TO intermediate WITH INHERIT FALSE, SET TRUE`);
    const reversed = await read();
    assert.equal(reversed.decision, "NO_SCOPED_GRANT");
    assert.deepEqual(reversed.evidence.tableGrantPaths, []);
  } finally {
    await db.close();
  }
});
