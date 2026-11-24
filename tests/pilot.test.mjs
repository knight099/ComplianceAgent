import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { assess } from "../relay/offboarding.mjs";
import { reconcile } from "../lib/reconcile.mjs";
test("pilot reconciles an inherited grant and independently observes its subsequent removal", async () => {
  const db = new PGlite(),
    source = "pilot",
    resource = ["public", "records"],
    time = new Date("2026-11-24T08:00:00Z");
  try {
    await db.exec(
      "CREATE TABLE records(id int); CREATE ROLE reviewer; CREATE ROLE readers; GRANT SELECT ON records TO readers; GRANT readers TO reviewer",
    );
    const feed = {
      source,
      hrRevision: "1",
      hrObserved: time.toISOString(),
      resources: [resource],
      employees: [
        { id: "1", status: "terminated", role: "reviewer" },
        { id: "2", status: "terminated" },
      ],
    };
    const baseline = {
      source,
      checks: [
        { employeeId: "1", resource, expected: "NO_SCOPED_GRANT" },
        { employeeId: "3", resource, expected: "NO_SCOPED_GRANT" },
      ],
    };
    async function scan(date) {
      const a = await assess(feed, (s, p) => db.query(s, p), date);
      return {
        id: a.id,
        source,
        collected_at: a.observed,
        results: a.results.map((r) => ({ ...r, employee_id: r.employeeId })),
      };
    }
    const before = await scan(time);
    const first = reconcile(before, baseline, +time);
    assert.deepEqual(first.counts, {
      DISAGREES: 1,
      MISSING_OBSERVATION: 1,
      MISSING_BASELINE: 1,
    });
    assert.equal(first.unresolvedEmployees, 1);
    await db.exec("REVOKE readers FROM reviewer");
    baseline.checks[0].revokedAt = new Date(+time + 1000).toISOString();
    const after = await scan(new Date(+time + 6000));
    assert.equal(
      reconcile(after, baseline, +time + 7000).checks[0]
        .verificationDelaySeconds,
      5,
    );
    assert.equal(
      reconcile(after, baseline, +time + 9e7).checks[0].outcome,
      "UNVERIFIED",
    );
    assert.throws(() => reconcile(after, { ...baseline, source: "other" }));
  } finally {
    await db.close();
  }
});
