import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { issue } from "../lib/identities.mjs";
import { POST } from "../app/api/device/route.js";
import { GET } from "../app/api/v1/evidence/route.js";

test("device enrollment owns the upload and operator membership scopes retrieval", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const dir = mkdtempSync(join(tmpdir(), "device-evidence-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  process.env.DEVICE_KEYS_FILE = join(dir, "keys.json");
  process.env.AUTH_MODE = "named";
  process.env.DATABASE_URL = "postgres://localhost/unused";
  t.mock.method(pg.Pool.prototype, "query", (sql, args) => db.query(sql, args));
  t.mock.method(pg.Pool.prototype, "connect", async () => ({
    query: (sql, args) => db.query(sql, args),
    release() {},
  }));
  const migration = name => db.exec(readFileSync("migrations/" + name + ".sql", "utf8"));
  for (const name of ["001-assurance", "002-identities", "003-operator-permissions",
    "007-access-graph", "008-organizations"]) await migration(name);
  await db.exec("INSERT INTO collected_evidence(id,observation) VALUES ('legacy','{}')");
  await migration("010-evidence-organizations");
  await migration("010-evidence-organizations");
  assert.equal((await db.query("SELECT organization_id FROM collected_evidence")).rows[0].organization_id, "installation");
  await db.exec("INSERT INTO organizations VALUES ('north')");
  await migration("011-evidence-rls");
  await migration("011-evidence-rls");
  const key = "ad".repeat(32);
  writeFileSync(process.env.DEVICE_KEYS_FILE, JSON.stringify({ laptop: { organization: "north", key } }));
  const observation = { source: "laptop", mode: "Imported", organization_id: "installation", facts: [] };
  const bytes = Buffer.from(JSON.stringify(observation));
  const post = () => POST(new Request("http://localhost/api/device", {
    method: "POST", body: JSON.stringify({ device: "laptop", payload: bytes.toString("base64"),
      mac: createHmac("sha256", Buffer.from(key, "hex")).update(bytes).digest("hex") }),
  }));
  const first = await post();
  assert.equal(first.status, 200);
  const { id } = await first.json();
  assert.deepEqual(await (await post()).json(), { id });
  const get = (name, secret) => GET(new Request("http://localhost/api/v1/evidence?id=" + id + "&organization_id=north", {
    headers: { authorization: "Basic " + Buffer.from(name + ":" + secret).toString("base64") },
  }));
  const north = await issue(db, "operator", "north-user", null, "reviewer", "north");
  const local = await issue(db, "operator", "local-user", null, "reviewer");
  assert.equal((await (await get("north-user", north)).json()).observation.source, "laptop");
  assert.equal((await get("local-user", local)).status, 404);
  assert.equal((await get("north-user", "invalid")).status, 401);
  writeFileSync(process.env.DEVICE_KEYS_FILE, JSON.stringify({ laptop: key }));
  assert.deepEqual(await (await post()).json(), { id });
  assert.equal((await get("local-user", local)).status, 200);
  assert.equal((await db.query("SELECT id FROM collected_evidence WHERE id=$1", [id])).rows.length, 2);
});
