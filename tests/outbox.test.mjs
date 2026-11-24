import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openOutbox } from "../relay/outbox.mjs";

test("unacknowledged reports survive restart, stay bound to the destination, and retain their ID", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "relay-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const report = {
    id: "assessment-id",
    employee: "confidential-employee-name",
  };
  let q = openOutbox(dir, "https://control.internal");
  q.enqueue(report);
  assert.equal(
    readFileSync(join(dir, "outbox.sqlite")).includes(report.employee),
    false,
  );
  await assert.rejects(
    q.flush(async () => {
      throw Error("offline");
    }),
    /offline/,
  );
  q.close();
  const other = openOutbox(dir, "https://other.internal");
  assert.equal(await other.flush(() => assert.fail()), 0);
  other.close();
  q = openOutbox(dir, "https://control.internal");
  try {
    await assert.rejects(
      q.flush(() => ({ id: "wrong" })),
      /Receipt/,
    );
    q.enqueue({ ...report, id: "second" });
    assert.equal(
      await q.flush((body) => {
        const r = JSON.parse(body);
        assert.equal(r.employee, report.employee);
        return { id: r.id };
      }),
      2,
    );
    assert.equal(await q.flush(() => assert.fail()), 0);
  } finally {
    q.close();
  }
});
