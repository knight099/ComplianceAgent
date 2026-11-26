import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { database, saveEvidence, evidenceById, saveAssessment } from "../../lib/store.mjs";
import { issue } from "../../lib/identities.mjs";
import { GET as health } from "../../app/api/collection-health/route.js";
import { GET as alerts } from "../../app/api/collection-alerts/route.js";
import { GET as assessments } from "../../app/api/v1/assessments/route.js";
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
  await issue(admin, "relay", "runtime-relay", "runtime-source", undefined, org);
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
      "INSERT INTO organizations VALUES ('denied')", "SELECT * FROM assessments", "SET ROLE " + forbiddenRole])
      await assert.rejects(pool.query(sql), {code:"42501"});
  }
  const req = new Request("http://localhost", {headers:{
    authorization:"Basic " + Buffer.from("runtime-reviewer:" + secret).toString("base64"),
  }});
  assert.deepEqual(await (await assessments(req)).json(), []);
  const receipt = await saveEvidence({ source: "runtime-device" }, org);
  assert.equal((await evidenceById(receipt, org)).observation.source, "runtime-device");
  const batch = { id: randomUUID(), source: "runtime-source", policy: "v1",
    observed: new Date(0).toISOString(), results: [] };
  assert.equal(await saveAssessment(batch, "runtime-relay", org), true);
  assert.equal((await (await assessments(req)).json())[0].id, batch.id);
  assert.equal((await (await health(req)).json())[0].source, "runtime-source");
  await run(process.execPath, ["scripts/collection-monitor.mjs", "--once"], {
    env: {...process.env, DATABASE_URL:urls[1], COMPLYOS_MONITOR_ORGANIZATION:org, ALERT_WEBHOOK_URL:""},
  });
  const state = await (await alerts(req)).json();
  assert.equal(state.open[0].source, "runtime-source");
  assert.ok(state.checked_at);
});
