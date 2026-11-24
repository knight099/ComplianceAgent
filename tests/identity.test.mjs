import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { issue, revoke, identify } from "../lib/identities.mjs";
test("independent identities, source binding and revocation persist in PostgreSQL", async () => {
  const db = new PGlite();
  const basic = (name, secret) =>
    "Basic " + Buffer.from(name + ":" + secret).toString("base64");
  try {
    for (const file of [
      "001-assurance.sql",
      "002-identities.sql",
      "003-operator-permissions.sql",
      "003-operator-permissions.sql",
    ])
      await db.exec(readFileSync("migrations/" + file, "utf8"));
    const a = await issue(db, "operator", "alice"),
      b = await issue(db, "operator", "ben"),
      r = await issue(db, "relay", "private", "finance");
    assert.deepEqual(await identify(db, "relay", "Bearer " + r), {
      name: "private",
      source: "finance",
      ai_enabled: false,
    });
    assert.equal(await identify(db, "operator", basic("alice", r)), null);
    assert.equal(await identify(db, "operator", basic("ben", a)), null);
    assert.ok(await identify(db, "operator", basic("alice", a)));
    await revoke(db, "operator", "alice");
    assert.equal(await identify(db, "operator", basic("alice", a)), null);
    assert.ok(await identify(db, "operator", basic("ben", b)));
    await revoke(db, "relay", "private");
    assert.equal(await identify(db, "relay", "Bearer " + r), null);
  } finally {
    await db.close();
  }
});
