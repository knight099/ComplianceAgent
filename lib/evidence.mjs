import { createHash, createHmac, timingSafeEqual } from "node:crypto";
export function ingest(s, e) {
  if (
    !e ||
    !["Live", "Imported", "Recorded"].includes(e.mode) ||
    !["Observed", "Unknown"].includes(e.status) ||
    typeof e.source !== "string" ||
    !Number.isFinite(Date.parse(e.observed)) ||
    !Array.isArray(e.facts)
  )
    throw Error("Invalid evidence");
  const id = createHash("sha256").update(JSON.stringify(e)).digest("hex");
  if (!s.imports.some((x) => x.id === id))
    s.imports.push({ ...e, id, received: new Date().toISOString() });
  return id;
}
export function verifyBundle(bundle, keys) {
  if (typeof bundle.device !== "string" || !Object.hasOwn(keys, bundle.device))
    throw Error("Unknown device");
  const bytes = Buffer.from(bundle.payload, "base64");
  const mac = createHmac("sha256", Buffer.from(keys[bundle.device], "hex"))
    .update(bytes)
    .digest();
  const actual = Buffer.from(bundle.mac, "hex");
  if (mac.length !== actual.length || !timingSafeEqual(mac, actual))
    throw Error("Invalid signature");
  const e = JSON.parse(bytes);
  if (e.source !== bundle.device || e.mode !== "Imported")
    throw Error("Device mismatch");
  return e;
}
