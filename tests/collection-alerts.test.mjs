import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { evaluateAlerts, alerts } from "../lib/collection-alerts.mjs";
test("monitor deduplicates failures, requires scope-matched recovery and records recurrence", async () => {
  const db = new PGlite();
  try {
    for (const m of [
      "001-assurance",
      "002-identities",
      "007-access-graph",
      "008-organizations",
      "004-collection-alerts",
      "004-collection-alerts",
      "009-alert-organizations",
    ])
      await db.exec(readFileSync("migrations/" + m + ".sql", "utf8"));
    await db.exec(
      "INSERT INTO access_identities(kind,name,secret_hash,source) VALUES('relay','one','abc','private')",
    );
    const scan = async () => {
      await db.transaction((tx) => evaluateAlerts(tx));
      return alerts(db);
    };
    const report = async (failed, employees) => {
      const id = randomUUID();
      await db.query(
        "INSERT INTO assessments(id,source,collected_at,policy_version) VALUES($1,'private',now(),'v1')",
        [id],
      );
      for (const e of employees)
        await db.query(
          "INSERT INTO assessment_results VALUES($1,$2,'staff','table',$3,$4)",
          [
            id,
            e,
            failed ? "UNKNOWN" : "RETAINED",
            failed ? { reason: "PostgreSQL collection failed" } : {},
          ],
        );
      return id;
    };
    assert.equal((await alerts(db)).checked_at, null);
    assert.equal((await scan()).open[0].detail, "Awaiting first collection");
    await report(true, ["a"]);
    const initial = await scan();
    assert.equal(initial.recent.length, 1);
    const incident = initial.open[0].id;
    await report(true, ["b"]);
    assert.equal((await scan()).open[0].id, incident);
    await report(false, ["b"]);
    assert.equal((await scan()).open[0].id, incident);
    const verified = await report(false, ["a", "b"]);
    const complete = await scan();
    assert.equal(complete.open.length, 0);
    assert.equal(complete.recent[0].recovery_assessment, verified);
    await report(true, ["a"]);
    assert.notEqual((await scan()).open[0].id, incident);
  } finally {
    await db.close();
  }
});
