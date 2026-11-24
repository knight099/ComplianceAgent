import { createHash, randomBytes } from "node:crypto";
const hash = (secret) => createHash("sha256").update(secret).digest("hex");

export async function issue(db, kind, name, source = null) {
  if (
    !["operator", "relay"].includes(kind) ||
    !/^[a-zA-Z0-9_.-]{1,80}$/.test(name || "") ||
    (kind === "relay"
      ? typeof source !== "string" || !source.trim()
      : source !== null)
  )
    throw Error("Expected operator NAME or relay NAME SOURCE");
  const secret = randomBytes(32).toString("base64url");
  await db.query(
    "INSERT INTO access_identities(kind,name,source,secret_hash) VALUES($1,$2,$3,$4)",
    [kind, name, source, hash(secret)],
  );
  return secret;
}
export async function revoke(db, kind, name) {
  const result = await db.query(
    "UPDATE access_identities SET revoked_at=now() WHERE kind=$1 AND name=$2 AND revoked_at IS NULL RETURNING name",
    [kind, name],
  );
  return !!result.rows.length;
}
export async function identify(db, kind, header) {
  let secret,
    name = null;
  if (kind === "operator" && header.startsWith("Basic ")) {
    const parts = Buffer.from(header.slice(6), "base64").toString().split(":");
    if (parts.length !== 2) return null;
    [name, secret] = parts;
  } else if (kind === "relay" && header.startsWith("Bearer "))
    secret = header.slice(7);
  else return null;
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) return null;
  const result = await db.query(
    "SELECT name,source FROM access_identities WHERE kind=$1 AND secret_hash=$2 AND revoked_at IS NULL AND ($3::text IS NULL OR name=$3)",
    [kind, hash(secret), name],
  );
  return result.rows[0] || null;
}
