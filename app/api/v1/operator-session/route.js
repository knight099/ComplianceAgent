import { requireOperator } from "../../../../lib/auth.mjs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const headers = { "Cache-Control": "private, no-store" };
  if (process.env.AUTH_MODE !== "oidc") return new Response(null, { status: 404, headers });
  const operator = await requireOperator(req);
  if (operator instanceof Response) {
    operator.headers.set("Cache-Control", headers["Cache-Control"]);
    return operator;
  }
  return Response.json({
    organization: operator.organization_id,
    role: operator.ai_enabled ? "analyst" : "reviewer",
    expiresAt: operator.expiresAt,
  }, { headers });
}
