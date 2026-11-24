import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { collectionHealth } from "../lib/collection-health.mjs";
import { GET } from "../app/api/collection-health/route.js";
test("health includes unreported enrollments and uses collection order for late arrivals", async () => {
  const db = new PGlite();
  try {
    for (const m of ["001-assurance", "002-identities"])
      await db.exec(readFileSync("migrations/" + m + ".sql", "utf8"));
    await db.exec(
      "INSERT INTO access_identities(kind,name,secret_hash,source) VALUES ('relay','r','1','pending'),('relay','old','2','revoked'); UPDATE access_identities SET revoked_at=now() WHERE name='old'",
    );
    const run = async (source, hours) => {
      const id = randomUUID();
      await db.query(
        "INSERT INTO assessments(id,source,collected_at,policy_version) VALUES($1,$2,now()+$3::int*interval '1 hour','v1')",
        [id, source, hours],
      );
      return id;
    };
    const id = await run("primary", -1);
    await run("primary", -48);
    await run("lagging", -30);
    await run("clock", 1);
    for (const [index, reason] of [
      "PostgreSQL collection failed",
      "Missing or ambiguous identity mapping",
    ].entries())
      await db.query(
        "INSERT INTO assessment_results VALUES($1,$2,'staff','kyc','UNKNOWN',$3)",
        [id, String(index), { reason }],
      );
    const rows = Object.fromEntries(
      (await collectionHealth(db)).map((r) => [r.source, r]),
    );
    assert.equal(rows.primary.assessment_id, id);
    assert.equal(rows.primary.freshness, "Current");
    assert.deepEqual(
      [rows.primary.evaluated, rows.primary.unknown, rows.primary.failed],
      [2, 2, 1],
    );
    assert.equal(rows.pending.freshness, "Awaiting first collection");
    assert.equal(rows.pending.evaluated, null);
    assert.equal(rows.lagging.freshness, "Overdue");
    assert.equal(rows.lagging.evaluated, 0);
    assert.equal(rows.clock.freshness, "Future timestamp");
    assert.equal(rows.revoked, undefined);
  } finally {
    await db.close();
  }
});
test("anonymous requests cannot read fleet health", async () => {
  process.env.AUTH_MODE = "shared";
  assert.equal(
    (await GET(new Request("http://localhost/api/collection-health"))).status,
    401,
  );
});
