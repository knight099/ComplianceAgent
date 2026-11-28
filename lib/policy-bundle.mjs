import { createHash } from "node:crypto";

// PostgreSQL jsonb and publisher files can serialize object fields in different orders.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

export function bundleRevision(organization, definition) {
  return createHash("sha256").update(JSON.stringify(canonical([organization, "1.0.0", definition]))).digest("hex");
}
