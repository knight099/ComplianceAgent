import test from "node:test";
import assert from "node:assert/strict";
import { database, migrate, saveEvidence, evidenceById } from "../../lib/store.mjs";

// Run against a freshly created, disposable PostgreSQL database.
test("pooled evidence transactions and concurrent database sessions isolate organizations", async t => {
  if (!process.env.COMPLYOS_TEST_DATABASE_URL) throw Error("Provide COMPLYOS_TEST_DATABASE_URL");
  process.env.DATABASE_URL = process.env.COMPLYOS_TEST_DATABASE_URL;
  const pool = database();
  t.after(() => pool.end());
  await migrate();
  await migrate();
  await pool.query("INSERT INTO organizations VALUES ('north'), ('south')");
  const organizations = ["north", "south"];
  const ids = await Promise.all(organizations.map(source => saveEvidence({ source }, source)));
  for (let round = 0; round < 4; round++) {
    await Promise.all(organizations.map(async (org, i) => {
      assert.equal((await evidenceById(ids[i], org)).observation.source, org);
      assert.equal(await evidenceById(ids[1-i], org), undefined);
    }));
  }
  // Keep both transactions open, then deliberately omit the application WHERE clause.
  const clients = await Promise.all(organizations.map(() => pool.connect()));
  try {
    await Promise.all(clients.map(async (client, i) => {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE complyos_evidence");
      assert.equal((await client.query("SELECT id FROM collected_evidence")).rowCount, 0);
      await client.query("SELECT set_config('complyos.organization_id',$1,true)", [organizations[i]]);
    }));
    await Promise.all(clients.map(async (client, i) => {
      assert.deepEqual((await client.query("SELECT id FROM collected_evidence")).rows, [{ id: ids[i] }]);
      await assert.rejects(client.query(
        "INSERT INTO collected_evidence (id, observation, organization_id) VALUES ('foreign','{}',$1)",
        [organizations[1-i]]), { code: "42501" });
      await client.query("ROLLBACK");
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE complyos_evidence");
      assert.equal((await client.query("SELECT id FROM collected_evidence")).rowCount, 0);
    }));
  } finally {
    for (const client of clients) {
      await client.query("ROLLBACK");
      client.release();
    }
  }
});
