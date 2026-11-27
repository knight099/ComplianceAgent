import { readFile } from "node:fs/promises";
import { createRemoteJWKSet, jwtVerify } from "jose";

let cachedKeys;
const text = value => typeof value === "string" && value.trim().length > 0;
function httpsAddress(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
    throw Error("Invalid OIDC address");
  return url;
}

export async function oidcOperator(req) {
  // The login proxy forwards the signed access token as a Bearer credential.
  const match = /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!match || match[1].length > 16384) return null;
  try {
    const { issuer, audience, jwksUri, members } = JSON.parse(await readFile(process.env.OIDC_CONFIG_FILE, "utf8"));
    httpsAddress(issuer);
    const url = httpsAddress(jwksUri);
    if (!text(audience) || !Array.isArray(members)) return null;
    if (cachedKeys?.uri !== url.href) cachedKeys = { uri: url.href, resolve: createRemoteJWKSet(url) };
    const { payload } = await jwtVerify(match[1], cachedKeys.resolve, {
      issuer, audience, algorithms: ["RS256", "ES256"], typ: "at+jwt",
      requiredClaims: ["exp", "iat", "sub"],
    });
    if (!text(payload.sub)) return null;
    const matches = members.filter(member => member.subject === payload.sub);
    if (matches.length !== 1) return null;
    const [member] = matches;
    if (!text(member.organization) || !["analyst", "reviewer"].includes(member.role)) return null;
    return { name: payload.sub, organization_id: member.organization, source: null, ai_enabled: member.role === "analyst" };
  } catch {
    return null;
  }
}
