import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { alerts, evaluateAlerts } from "../lib/collection-alerts.mjs";
import { deliverNext, webhookConfig } from "../lib/alert-webhook.mjs";
import { deliveryStatus } from "../lib/delivery-status.mjs";

test("same-source episodes and same-URL webhook queues stay separate across organizations and upgrades", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const files = readdirSync("migrations").filter(f => f.endsWith(".sql")).sort();
  const apply = file => db.exec(readFileSync("migrations/" + file, "utf8"));
  for (const file of files.filter(f => f < "009")) await apply(file);
  await db.exec("INSERT INTO collection_monitor VALUES(true,now()); INSERT INTO collection_alerts(source,condition,detail) VALUES('legacy','freshness','Overdue')");
  await apply("009-alert-organizations.sql");
  assert.ok((await alerts(db)).checked_at);
  assert.equal((await alerts(db)).open[0].source, "legacy");

  await db.exec("INSERT INTO organizations VALUES('second'); INSERT INTO access_identities(kind,name,secret_hash,source,organization_id) VALUES('relay','one','key1','payments','installation'),('relay','two','key2','payments','second')");
  const config = org => webhookConfig("https://receiver.example", org.padEnd(32, "x"), org);
  const scan = org => db.transaction(async tx => {
    await tx.query("SELECT set_config('complyos.webhook_destination',$1,true)", [config(org).destination]);
    await evaluateAlerts(tx, org);
  });
  await scan("installation");
  assert.equal((await alerts(db,"second")).checked_at, null);
  await scan("second");
  // Production startup replays the additive migration chain.
  for (const file of files) await apply(file);
  const second = await alerts(db,"second");
  assert.equal(second.open.length, 1);
  const episode = second.open[0];
  assert.equal(episode.source, "payments");
  assert.equal((await alerts(db)).open.length, 2);
  await db.exec("INSERT INTO assessments(id,source,policy_version,collected_at,organization_id) VALUES(gen_random_uuid(),'payments','v1',now(),'second')");
  await scan("second");
  assert.equal((await alerts(db,"second")).recent[0].id, episode.id);
  assert.equal((await alerts(db)).recent.length, 0);
  await assert.rejects(db.query(
    "UPDATE collection_alerts SET recovery_assessment=$1 WHERE organization_id='installation' AND source='payments'",
    [(await alerts(db,"second")).recent[0].recovery_assessment],
  ), /foreign key/i);
  assert.equal((await deliveryStatus(db,"second")).pending_count, 2);
  assert.equal((await deliveryStatus(db)).pending_count, 1);

  const received = [];
  const send = async (_url, options) => {
    received.push(JSON.parse(options.body));
    return new Response(null, { status: 204 });
  };
  for (let n = 0; n < 2; n++) assert.ok(await deliverNext(db, config("second"), send));
  assert.equal(await deliverNext(db, config("second"), send), false);
  assert.ok(received.every(event => event.organizationId === "second"));
  assert.deepEqual(received.map(item => [item.alertId,item.transition]), [
    [String(episode.id),"opened"], [String(episode.id),"resolved"],
  ]);
  assert.equal((await deliveryStatus(db)).pending_count, 1);
  assert.equal((await deliveryStatus(db)).acknowledged.length, 0);
});
