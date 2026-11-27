import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { issue, setOperatorRole, revoke } from "../lib/identities.mjs";
import { GET as assessments, POST as upload } from "../app/api/assessments/route.js";
import { GET as v1Assessments } from "../app/api/v1/assessments/route.js";
import { GET as history } from "../app/api/history/route.js";
import { GET as health } from "../app/api/collection-health/route.js";
import { GET as alertState } from "../app/api/collection-alerts/route.js";
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
    "008-organizations",
    "004-collection-alerts", "005-webhook-outbox", "006-delivery-status", "009-alert-organizations", "012-assessment-rls", "013-monitoring-rls", "014-health-reader", "015-identity-lookup",
  ])
    await db.exec(readFileSync("migrations/" + file + ".sql", "utf8"));
  const key = await issue(db, "operator", "user", null, "reviewer");
  const req = new Request("http://localhost", {
    headers: {
      authorization: "Basic " + Buffer.from("user:" + key).toString("base64"),
    },
  });
  await db.exec("INSERT INTO organizations VALUES ('other')");
  await db.exec(`INSERT INTO assessments (id,source,collected_at,policy_version,organization_id)
    VALUES ('00000000-0000-0000-0000-000000000001','payments',now(),'v1','installation'),
           ('00000000-0000-0000-0000-000000000002','payments',now()+interval '1 hour','v1','other')`);
  t.mock.method(pg.Pool.prototype, "connect", async () => ({
    async query(sql, args) {
      const result = await db.query(sql, args);
      return { ...result, rowCount: result.rows.length };
    },
    release() {},
  }));
  const versioned = await v1Assessments(req);
  assert.equal(versioned.status, 200);
  assert.equal(versioned.headers.get("Cache-Control"), "no-store");
  const body = await versioned.json();
  assert.deepEqual(body.map(row => row.organization_id), ["installation"]);
  assert.deepEqual(body, await (await assessments(req)).json());
  const otherKey = await issue(db, "operator", "other-reviewer", null, "reviewer", "other");
  const otherReq = new Request("http://localhost?organization_id=installation", {
    headers: { authorization: "Basic " + Buffer.from("other-reviewer:" + otherKey).toString("base64") },
  });
  const otherRows = await (await assessments(otherReq)).json();
  assert.deepEqual(otherRows.map(row => row.organization_id), ["other"]);

  const relayKey = await issue(db, "relay", "other-relay", "payments", undefined, "other");
  const post = (id, source = "payments") => upload(new Request("http://localhost", {
    method: "POST", headers: { authorization: "Bearer " + relayKey },
    body: JSON.stringify({ id, source, organization_id: "installation",
      policy: "hr.postgres.offboarding/v1", observed: new Date().toISOString(), results: [] }),
  }));
  const newId = "00000000-0000-0000-0000-000000000003";
  assert.equal((await post(newId, "unbound")).status, 403);
  assert.equal((await post(newId)).status, 200);
  assert.equal((await post(newId)).status, 200);
  assert.equal((await post(body[0].id)).status, 409);
  const stored = await db.query("SELECT organization_id FROM assessments WHERE id=$1", [newId]);
  assert.equal(stored.rows[0].organization_id, "other");
  const otherHistory = await history(new Request("http://localhost/api/history?source=payments", {
    headers: otherReq.headers,
  }));
  const ids = (await otherHistory.json()).map(run => run.id);
  assert.ok(ids.includes(newId));
  assert.ok(!ids.includes(body[0].id));
  assert.equal((await (await health(otherReq)).json())[0].assessment_id, otherRows[0].id);
  assert.equal((await alertState(otherReq)).status, 200);
  await setOperatorRole(db, "other-reviewer", "analyst", "other");
  const foreignSummary = await completion(new Request("http://localhost", {
    method: "POST", headers: { ...Object.fromEntries(otherReq.headers), "content-type": "application/json" },
    body: JSON.stringify({ op: "explain", id: body[0].id }),
  }));
  assert.equal(foreignSummary.status, 404);
  assert.equal((await providers(req)).status, 403);
  assert.equal((await completion(req)).status, 403);
  await setOperatorRole(db, "user", "analyst");
  assert.equal((await providers(req)).status, 200);
  process.env.AI_TENANT_PROVIDERS = JSON.stringify({ installation: ["OpenAI"] });
  const sent = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    sent.push(JSON.parse(init.body));
    return Response.json({choices:[{message:{content:"Summary"}}]});
  });
  const explain = (headers, input) => completion(new Request("http://localhost", {
    method: "POST", headers: { ...Object.fromEntries(headers), "content-type":"application/json" },
    body: JSON.stringify({op:"explain", model:"gpt-4o-mini", provider:"OpenAI", key:"fixture-token", ...input})
  }));
  assert.equal((await explain(req.headers, {id:body[0].id})).status, 200);
  assert.equal((await explain(req.headers, {id:body[0].id, organization_id:"other"})).status, 400);
  assert.equal((await explain(otherReq.headers, {id:newId})).status, 400);
  assert.equal(sent.length, 1);
  assert.deepEqual(JSON.parse(sent[0].messages.at(-1).content),
    {retained:"0-4", unknown:"0-4", no_scoped_grant:"0-4", stale:false});
  await setOperatorRole(db, "user", "reviewer");
  assert.equal((await providers(req)).status, 403);
  await revoke(db, "operator", "user");
  assert.equal((await assessments(req)).status, 401);
  assert.equal((await v1Assessments(req)).status, 401);
});
