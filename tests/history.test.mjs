import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { assess } from "../relay/offboarding.mjs";
import { GET } from "../app/api/history/route.js";
import { compareAssessments } from "../lib/history.mjs";

test("history API verifies two-stage revocation from persisted catalog observations", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  t.mock.method(pg.Pool.prototype, "query", (sql, args) => db.query(sql, args));
  process.env.DATABASE_URL = "postgres://localhost/unused";
  process.env.AUTH_MODE = "shared";
  process.env.OPERATOR_PASSWORD = "local-test";
  await db.exec(readFileSync("migrations/001-assurance.sql", "utf8"));
  await db.exec(
    "CREATE ROLE staff; CREATE ROLE lenders; CREATE ROLE readers; CREATE TABLE kyc (id int); GRANT SELECT ON kyc TO lenders, readers; GRANT lenders,readers TO staff",
  );
  const time = Date.now() - 60000;
  const feed = {
    source: "finance",
    hrRevision: "v1",
    hrObserved: new Date(time).toISOString(),
    resources: [["public", "kyc"]],
    employees: [{ id: "e1", role: "staff", status: "terminated" }],
  };
  async function collect(offset) {
    const a = await assess(
      feed,
      (sql, p) => db.query(sql, p),
      new Date(time + offset),
    );
    await db.query(
      "INSERT INTO assessments(id,source,collected_at,policy_version) VALUES($1,$2,$3,$4)",
      [a.id, a.source, a.observed, a.policy],
    );
    for (const r of a.results)
      await db.query(
        "INSERT INTO assessment_results VALUES($1,$2,$3,$4,$5,$6)",
        [a.id, r.employeeId, r.role, r.resource, r.decision, r.evidence],
      );
    return a.id;
  }
  const headers = {
    Authorization:
      "Basic " + Buffer.from("operator:local-test").toString("base64"),
  };
  const get = (q) =>
    GET(
      new Request("http://localhost/api/history?" + new URLSearchParams(q), {
        headers,
      }),
    );
  const pair = async (before, after) => {
    const res = await get({ source: "finance", before, after });
    assert.equal(res.status, 200);
    return (await res.json()).changes[0];
  };
  const first = await collect(0);
  await db.exec("REVOKE lenders FROM staff");
  const second = await collect(1000);
  await db.exec("REVOKE readers FROM staff");
  const third = await collect(2000);
  const partial = await pair(first, second);
  assert.equal(partial.outcome, "Access retained");
  assert.deepEqual(partial.removed, [["staff", "lenders"]]);
  assert.deepEqual(partial.remaining, [["staff", "readers"]]);
  assert.equal((await pair(second, third)).outcome, "Verified no scoped grant");
  assert.equal((await (await get({ source: "finance" })).json()).length, 3);
  assert.equal(
    (await get({ source: "different", before: first, after: third })).status,
    404,
  );
  assert.equal(
    (await get({ source: "finance", before: third, after: first })).status,
    400,
  );
  assert.equal(
    (await GET(new Request("http://localhost/api/history?source=finance")))
      .status,
    401,
  );
});

test("evidence gaps and incomplete paths cannot prove removal", () => {
  const now = Date.now(),
    row = {
      employee_id: "e1",
      resource: "kyc",
      role_name: "staff",
      decision: "RETAINED",
      evidence: {
        pathLimitReached: false,
        tableGrantPaths: [["staff", "readers"]],
      },
    };
  const before = {
      source: "finance",
      id: "a",
      collected_at: new Date(now - 2000),
      policy_version: "v1",
      results: [row],
    },
    after = { ...before, id: "b", collected_at: new Date(now - 1000) };
  const diff = (b, n = now) =>
    compareAssessments(before, { ...after, ...b }, n).changes[0];
  for (const b of [
    { results: [] },
    { results: [{ ...row, role_name: "other" }] },
    { results: [{ ...row, decision: "UNKNOWN" }] },
    { policy_version: "v2" },
  ])
    assert.equal(diff(b).outcome, "Unverified");
  assert.equal(diff({}, now + 86400000).outcome, "Unverified");
  assert.equal(
    diff({
      results: [
        { ...row, evidence: { pathLimitReached: true, tableGrantPaths: [] } },
      ],
    }).removed,
    undefined,
  );
  assert.equal(
    compareAssessments(
      { ...before, results: [{ ...row, decision: "NO_SCOPED_GRANT" }] },
      after,
      now,
    ).changes[0].outcome,
    "Newly observed access",
  );
});
