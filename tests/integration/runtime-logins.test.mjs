import { GET as getReviews, POST as postReview } from "../../app/api/v1/access-reviews/route.js";
import { buildAccessReport } from "../../lib/access-report.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { database, saveEvidence, evidenceById, organizationTransaction } from "../../lib/store.mjs";
import { issue, revoke } from "../../lib/identities.mjs";
import { GET as health } from "../../app/api/collection-health/route.js";
import { GET as alerts } from "../../app/api/collection-alerts/route.js";
import { GET as assessments } from "../../app/api/v1/assessments/route.js";
import { POST as upload } from "../../app/api/assessments/route.js";
const run = promisify(execFile);

test("dedicated logins run operations and monitoring without access to migrations or each other's roles", async t => {
  const adminUrl = process.env.COMPLYOS_TEST_DATABASE_URL;
  assert.ok(adminUrl, "Provide COMPLYOS_TEST_DATABASE_URL for a disposable database");
  const passwords = [randomBytes(32).toString("hex"), randomBytes(32).toString("hex")];
  const env = { ...process.env, DATABASE_URL: adminUrl, APP_DB_PASSWORD: passwords[0], WORKER_DB_PASSWORD: passwords[1] };
  for (let i = 0; i < 2; i++)
    await run(process.execPath, ["scripts/migrate.mjs", "--provision-runtime"], {env});
  const admin = new pg.Pool({connectionString: adminUrl});
  t.after(() => admin.end());
  const org = "runtime-test";
  await admin.query("INSERT INTO organizations VALUES ($1)", [org]);
  const secret = await issue(admin, "operator", "runtime-reviewer", null, "reviewer", org);
  const relaySecret = await issue(admin, "relay", "runtime-relay", "runtime-source", undefined, org);
  await admin.query("GRANT SELECT (kind,name,source,secret_hash,ai_enabled,revoked_at,organization_id) ON access_identities TO complyos_app");
  await run(process.execPath, ["scripts/migrate.mjs"], {env}); // schema-only upgrade of legacy grants
  await issue(admin, "relay", "runtime-other-relay", "other-source");
  const urls = ["complyos_app", "complyos_worker"].map((name,i) => {
    const url = new URL(adminUrl);
    url.username = name;
    url.password = passwords[i];
    return url.href;
  });
  process.env.AUTH_MODE = "named";
  process.env.DATABASE_URL = urls[0];
  const app = database();
  t.after(() => app.end());
  const worker = new pg.Pool({connectionString:urls[1]});
  t.after(() => worker.end());
  for (const [pool, name, forbiddenRole] of [[app,"complyos_app","complyos_monitor"], [worker,"complyos_worker","complyos_assessment"]]) {
    assert.equal((await pool.query("SELECT current_user AS name")).rows[0].name, name);
    for (const sql of ["ALTER TABLE assessments ADD COLUMN denied int", "CREATE ROLE denied",
      "INSERT INTO organizations VALUES ('denied')", "SELECT * FROM assessments", "SELECT secret_hash FROM access_identities", "SELECT name FROM access_identities", "SET ROLE " + forbiddenRole])
      await assert.rejects(pool.query(sql), {code:"42501"});
  }
  await assert.rejects(worker.query("SELECT * FROM public.authenticate_identity($1,$2,$3)", ["relay","x",null]), {code:"42501"});
  await organizationTransaction("alertReader", org, async client => {
    assert.deepEqual((await client.query("SELECT kind,source FROM access_identities")).rows,
      [{kind:"relay",source:"runtime-source"}]);
  });
  const req = new Request("http://localhost", {headers:{
    authorization:"Basic " + Buffer.from("runtime-reviewer:" + secret).toString("base64"),
  }});
  assert.deepEqual(await (await assessments(req)).json(), []);
  const endpoint = "http://localhost/api/v1/access-reviews";
  const list = async (request = req) => (await getReviews(request)).json();
  const at = new Date();
  const scope = { source: "runtime-source", hrObserved: at.toISOString(), hrRevision: "HR-1",
    employees: [{ id: "employee", role: "reader", status: "active", businessRole: "Marketing" }],
    resources: [["public", "kyc"]] };
  const policy = { source: scope.source, id: "customer-data", version: "1", reviewer: "owner", reference: "SOP-4",
    datasets: [{ resource: scope.resources[0], classification: "restricted", roles: { Marketing: "none" } }] };
  const review = (readable, time) => buildAccessReport(scope, policy, async () => ({
    rows: [{ resource_known: true, identity_known: true, readable_as: readable, paths: [], grantees: [] }]
  }), time);
  const submit = report => postReview(new Request(endpoint, { method: "POST",
    headers: { authorization: "Bearer " + relaySecret }, body: JSON.stringify(report) }));
  const first = await review(["reader"], at);
  first.saviynt = { analyticsName: "KYC history", observedAt: at.toISOString(), coverage: "observed" };
  const subject = first.rows[0];
  subject.governance = [{ recordId: "approval-1", employeeId: subject.employeeId, account: subject.databaseRole,
    schema: subject.resource[0], table: subject.resource[1], entitlement: "read KYC", approvedRole: "Lending",
    status: "revoked", expiresAt: null }];
  const firstResponse = await submit(first);
  assert.equal(firstResponse.status, 200);
  const firstId = (await firstResponse.json()).id;
  assert.equal((await (await submit(first)).json()).id, firstId);
  assert.equal((await submit({ ...first, source: "other", rows: [] })).status, 403);
  assert.equal((await submit({ ...first, rows: [{...first.rows[0], outcome: "AS_EXPECTED"}] })).status, 400);
  const second = await review([], new Date(at.getTime() + 1000));
  const secondId = (await (await submit(second)).json()).id;
  assert.deepEqual((await list()).map(run => run.id), [secondId, firstId]);
  const fetchById = (id, headers) => getReviews(new Request(endpoint + "?id=" + id, { headers }));
  for (const [id, outcome] of [[firstId, "EXCESS_ACCESS"], [secondId, "AS_EXPECTED"]])
    assert.equal((await (await fetchById(id, req.headers)).json()).rows[0].outcome, outcome);
  const storedReview = await (await fetchById(firstId, req.headers)).json();
  assert.deepEqual(storedReview.rows[0].governance, subject.governance);
  assert.deepEqual(storedReview.saviynt, first.saviynt);
  const outsider = await issue(admin, "operator", "outside-reviewer", null, "reviewer", "installation");
  const outsideHeaders = { authorization: "Basic " + Buffer.from("outside-reviewer:" + outsider).toString("base64") };
  assert.equal((await fetchById(firstId, outsideHeaders)).status, 404);
  assert.deepEqual(await list(new Request(endpoint, { headers: outsideHeaders })), []);
  await organizationTransaction("assessment", "installation", async client => {
    assert.equal((await client.query("SELECT id FROM access_reviews")).rowCount, 0);
  });
  const receipt = await saveEvidence({ source: "runtime-device" }, org);
  assert.equal((await evidenceById(receipt, org)).observation.source, "runtime-device");
  const batch = { id: randomUUID(), source: "runtime-source", policy: "hr.postgres.offboarding/v1",
    observed: new Date(0).toISOString(), results: [] };
  const post = () => upload(new Request("http://localhost/api/assessments", {
    method: "POST", headers: {authorization: "Bearer " + relaySecret}, body: JSON.stringify(batch),
  }));
  assert.equal((await post()).status, 200);
  assert.equal((await (await assessments(req)).json())[0].id, batch.id);
  assert.equal((await (await health(req)).json())[0].source, "runtime-source");
  await run(process.execPath, ["scripts/collection-monitor.mjs", "--once"], {
    env: {...process.env, DATABASE_URL:urls[1], COMPLYOS_MONITOR_ORGANIZATION:org, ALERT_WEBHOOK_URL:""},
  });
  const state = await (await alerts(req)).json();
  assert.equal(state.open[0].source, "runtime-source");
  assert.ok(state.checked_at);
  await revoke(admin, "operator", "runtime-reviewer", org);
  await revoke(admin, "relay", "runtime-relay", org);
  assert.equal((await assessments(req)).status, 401);
  assert.equal((await post()).status, 403);
});
