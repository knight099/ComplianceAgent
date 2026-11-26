import { createHash, randomBytes } from "node:crypto";
const hash = (secret) => createHash("sha256").update(secret).digest("hex");

export async function issue(db, kind, name, source = null, role = "analyst", organization = "installation") {
  if (
    !["operator", "relay"].includes(kind) ||
    !/^[a-zA-Z0-9_.-]{1,80}$/.test(name || "") ||
    (kind === "relay"
      ? typeof source !== "string" || !source.trim()
      : source !== null)
  )
    throw Error("Expected operator NAME or relay NAME SOURCE");
  const aiEnabled = kind === "operator" && roleAllowsAI(role);
  const secret = randomBytes(32).toString("base64url");
  await db.query(
    "INSERT INTO access_identities(kind,name,source,secret_hash,ai_enabled,organization_id) VALUES($1,$2,$3,$4,$5,$6)",
    [kind, name, source, hash(secret), aiEnabled, organization],
  );
  return secret;
}
export async function revoke(db, kind, name, organization = "installation") {
  const result = await db.query(
    "UPDATE access_identities SET revoked_at=now() WHERE kind=$1 AND name=$2 AND organization_id=$3 AND revoked_at IS NULL RETURNING name",
    [kind, name, organization],
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
    "SELECT name,source,ai_enabled,organization_id FROM access_identities WHERE kind=$1 AND secret_hash=$2 AND revoked_at IS NULL AND ($3::text IS NULL OR name=$3)",
    [kind, hash(secret), name],
  );
  return result.rows[0] || null;
}

function roleAllowsAI(role) {
  if (!["reviewer", "analyst"].includes(role))
    throw Error("Expected role reviewer or analyst");
  return role === "analyst";
}
export async function setOperatorRole(db, name, role, organization = "installation") {
  const result = await db.query(
    "UPDATE access_identities SET ai_enabled=$1 WHERE kind='operator' AND name=$2 AND organization_id=$3 AND revoked_at IS NULL RETURNING name",
    [roleAllowsAI(role), name, organization],
  );
  if (!result.rows.length) throw Error("Active operator not found");
}
