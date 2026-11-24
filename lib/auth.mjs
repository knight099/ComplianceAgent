import { identify } from "./identities.mjs";
import { database } from "./store.mjs";
import { timingSafeEqual, createHash } from "node:crypto";
export function authorized(req, expected) {
  const digest = (s) => createHash("sha256").update(s).digest();
  return (
    expected &&
    timingSafeEqual(
      digest(expected),
      digest(req.headers.get("authorization") || ""),
    )
  );
}
export async function authenticate(req, kind) {
  const mode = process.env.AUTH_MODE || "shared";
  if (mode === "named")
    return identify(database(), kind, req.headers.get("authorization") || "");
  if (mode !== "shared") return null;
  const secret =
    kind === "operator"
      ? process.env.OPERATOR_PASSWORD
      : process.env.RELAY_TOKEN;
  const expected =
    kind === "operator"
      ? "Basic " + Buffer.from("operator:" + secret).toString("base64")
      : "Bearer " + secret;
  return secret && authorized(req, expected)
    ? { name: "shared-" + kind, source: null, ai_enabled: kind === "operator" }
    : null;
}
export async function requireOperator(req, { ai = false } = {}) {
  const operator = await authenticate(req, "operator");
  if (!operator)
    return new Response(null, {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="ComplyOS"' },
    });
  if (ai && !operator.ai_enabled)
    return Response.json(
      { error: "Model access requires the analyst role." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
}
