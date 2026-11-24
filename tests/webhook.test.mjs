import { deliveryStatus } from "../lib/delivery-status.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { webhookConfig, deliverNext } from "../lib/alert-webhook.mjs";

test("transactional transitions retry in order with stable IDs and a signed body", async () => {
  const db = new PGlite(),
    config = webhookConfig("https://receiver.example/alerts", "s".repeat(32));
  try {
    for (const m of [
      "001-assurance",
      "004-collection-alerts",
      "005-webhook-outbox",
      "006-delivery-status",
      "006-delivery-status",
    ])
      await db.exec(readFileSync("migrations/" + m + ".sql", "utf8"));
    const insert =
      "INSERT INTO collection_alerts(source,condition,detail) VALUES('finance','freshness','Overdue')";
    await db.exec(insert);
    assert.equal(await deliverNext(db, config), false);
    await db.exec("DELETE FROM collection_alerts");
    const open = async (tx) => {
      await tx.query(
        "SELECT set_config('complyos.webhook_destination',$1,true)",
        [config.destination],
      );
      await tx.exec(insert);
    };
    await assert.rejects(
      db.transaction(async (tx) => {
        await open(tx);
        throw Error("rollback");
      }),
    );
    assert.equal(await deliverNext(db, config), false);
    await db.transaction(async (tx) => {
      await open(tx);
      await tx.exec(
        "UPDATE collection_alerts SET detail='Still overdue';UPDATE collection_alerts SET resolved_at=now()",
      );
    });
    assert.equal(
      await deliverNext(db, { ...config, destination: "different" }),
      false,
    );
    const events = [];
    const receiver = async (url, opts) => {
      const event = JSON.parse(opts.body);
      events.push(event);
      assert.equal(
        opts.headers["X-ComplyOS-Signature"],
        "sha256=" +
          createHmac("sha256", config.secret)
            .update(opts.headers["X-ComplyOS-Timestamp"] + "." + opts.body)
            .digest("hex"),
      );
      return new Response(null, { status: events.length === 1 ? 503 : 204 });
    };
    await deliverNext(db, config, receiver);
    assert.equal(await deliverNext(db, config, receiver), false);
    const failed = await deliveryStatus(db);
    assert.equal(failed.pending_count, 2);
    assert.deepEqual(failed.pending.map((x) => x.status).sort(), [
      "Waiting for opening",
      "Waiting for retry",
    ]);
    assert.equal(
      failed.pending.find((x) => x.transition === "opened").attempt_result,
      "HTTP 503",
    );
    assert.ok(
      failed.pending.every((x) => !("payload" in x) && !("destination" in x)),
    );
    await db.exec(
      "UPDATE alert_deliveries SET available_at=now() WHERE transition='opened'",
    );
    await deliverNext(db, config, receiver);
    await deliverNext(db, config, receiver);
    const status = await deliveryStatus(db);
    assert.equal(status.pending_count, 0);
    assert.equal(status.acknowledged.length, 2);
    assert.equal(
      status.acknowledged.find((x) => x.transition === "opened").attempts,
      2,
    );
    assert.ok(
      status.acknowledged.every((x) => x.attempt_result === "HTTP 204"),
    );
    assert.deepEqual(
      events.map((e) => e.transition),
      ["opened", "opened", "resolved"],
    );
    assert.equal(events[0].eventId, events[1].eventId);
    assert.equal(await deliverNext(db, config, receiver), false);
  } finally {
    await db.close();
  }
});
test("configuration is opt-in and rejects remote plaintext", () => {
  assert.equal(webhookConfig("", undefined), null);
  assert.throws(() => webhookConfig("http://remote.example", "s".repeat(32)));
});
