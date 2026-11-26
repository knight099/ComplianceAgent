import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database, migrate, organizationTransaction, saveAssessment } from "../../lib/store.mjs";
import { sweep, alerts } from "../../lib/collection-alerts.mjs";
import { deliveryStatus } from "../../lib/delivery-status.mjs";
import { webhookConfig, deliverNext } from "../../lib/alert-webhook.mjs";

test("monitor records and delivery leases stay within their organization", async t => {
  if (!process.env.COMPLYOS_TEST_DATABASE_URL) throw Error("Provide COMPLYOS_TEST_DATABASE_URL");
  process.env.DATABASE_URL = process.env.COMPLYOS_TEST_DATABASE_URL;
  const pool = database();
  t.after(() => pool.end());
  await migrate();
  const orgs = ["monitor-east", "monitor-west"];
  await pool.query("INSERT INTO organizations VALUES ($1), ($2)", orgs);
  const configs = orgs.map(org => webhookConfig("https://receiver.invalid", "s".repeat(32), org));
  await Promise.all(orgs.map(async (org, i) => {
    await saveAssessment({id: randomUUID(), source: "shared-source", observed: new Date().toISOString(),
      policy: "v1", results: [{employeeId: org, role: "staff", resource: "private", decision: "UNKNOWN",
        evidence: {reason: "PostgreSQL collection failed"}}]}, "relay", org);
    await sweep(configs[i].destination, org);
  }));
  await migrate(); // Preserve active alerts and queued deliveries through a restart.
  const view = org => organizationTransaction("alertReader", org, async client => ({
    state: await alerts(client, org),
    delivery: await deliveryStatus(client, org),
  }));
  const snapshots = await Promise.all(orgs.map(view));
  await Promise.all(orgs.map(async (org, i) => {
    const own = snapshots[i], other = snapshots[1-i];
    assert.equal(own.state.open.length, 1);
    assert.equal(own.delivery.pending_count, 1);
    assert.ok(own.state.checked_at);
    await organizationTransaction("monitor", org, async client => {
      for (const [table, column] of [["collection_alerts","organization_id"],
        ["organization_monitor","organization_id"], ["collection_alert_checks","employee_id"]]) {
        assert.deepEqual((await client.query(`SELECT ${column} AS owner FROM ${table}`)).rows, [{owner: org}]);
      }
      assert.equal((await client.query("UPDATE organization_monitor SET last_success=now() WHERE organization_id=$1",
        [orgs[1-i]])).rowCount, 0);
    });
    await assert.rejects(organizationTransaction("monitor", org, client => client.query(
      "INSERT INTO collection_alert_checks VALUES ($1,'foreign','r','s')", [other.state.open[0].id]
    )), {code:"42501"});
    await organizationTransaction("delivery", org, async client => {
      assert.deepEqual((await client.query("SELECT event_id FROM alert_deliveries")).rows,
        [{event_id:own.delivery.pending[0].event_id}]);
      assert.equal((await client.query("UPDATE alert_deliveries SET delivered_at=now() WHERE event_id=$1",
        [other.delivery.pending[0].event_id])).rowCount, 0);
    });
    const send = async (_url, options) => {
      const event = JSON.parse(options.body);
      // deliverNext handles transport failures, so check the persisted receipt below too.
      assert.equal(event.organizationId, org);
      assert.equal(event.eventId, own.delivery.pending[0].event_id);
      return new Response(null, {status:204});
    };
    assert.equal(await deliverNext(configs[i], send), true);
    assert.equal(await deliverNext(configs[i], send), false);
    const {delivery} = await view(org);
    assert.equal(delivery.pending_count, 0);
    assert.equal(delivery.acknowledged[0].attempt_result, "HTTP 204");
  }));
});
