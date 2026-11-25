import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { issue, setOperatorRole, revoke } from "../lib/identities.mjs";
import { GET as assessments } from "../app/api/assessments/route.js";
import { GET as v1Assessments } from "../app/api/v1/assessments/route.js";
import { GET as providers, POST as completion } from "../app/api/ai/route.js";

test("reviewer can read assessments; AI routes enforce role changes on the next request", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  t.mock.method(pg.Pool.prototype, "query", (sql, args) => db.query(sql, args));
  process.env.AUTH_MODE = "named";
  process.env.DATABASE_URL = "postgres://localhost/unused";
  for (const file of [
    "001-assurance",
    "002-identities",
    "003-operator-permissions",
    "007-access-graph",
  ])
    await db.exec(readFileSync("migrations/" + file + ".sql", "utf8"));
  const key = await issue(db, "operator", "user", null, "reviewer");
  const req = new Request("http://localhost", {
    headers: {
      authorization: "Basic " + Buffer.from("user:" + key).toString("base64"),
    },
  });
  await db.exec(`INSERT INTO assessments (id,source,collected_at,policy_version,organization_id)
    VALUES ('00000000-0000-0000-0000-000000000001','payments',now(),'v1','installation'),
           ('00000000-0000-0000-0000-000000000002','payments',now()+interval '1 hour','v1','other')`);
  const versioned = await v1Assessments(req);
  assert.equal(versioned.status, 200);
  assert.equal(versioned.headers.get("Cache-Control"), "no-store");
  const body = await versioned.json();
  assert.deepEqual(body.map(row => row.organization_id), ["installation"]);
  assert.deepEqual(body, await (await assessments(req)).json());
  assert.equal((await providers(req)).status, 403);
  assert.equal((await completion(req)).status, 403);
  await setOperatorRole(db, "user", "analyst");
  assert.equal((await providers(req)).status, 200);
  await setOperatorRole(db, "user", "reviewer");
  assert.equal((await providers(req)).status, 403);
  await revoke(db, "operator", "user");
  assert.equal((await assessments(req)).status, 401);
  assert.equal((await v1Assessments(req)).status, 401);
});
