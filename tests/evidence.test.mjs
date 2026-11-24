import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyBundle, ingest } from "../lib/evidence.mjs";
test("signed bundles authenticate device and deduplicate", () => {
  const key = "ab".repeat(32),
    keys = { lab: key };
  const bytes = Buffer.from(
    JSON.stringify({
      source: "lab",
      mode: "Imported",
      observed: new Date().toISOString(),
      facts: [],
      status: "Observed",
    }),
  );
  const b = {
    device: "lab",
    payload: bytes.toString("base64"),
    mac: createHmac("sha256", Buffer.from(key, "hex"))
      .update(bytes)
      .digest("hex"),
  };
  const s = {imports:[]};
  ingest(s, verifyBundle(b, keys));
  ingest(s, verifyBundle(b, keys));
  assert.equal(s.imports.length, 1);
  assert.throws(() => verifyBundle({ ...b, payload: "AAAA" }, keys));
});
