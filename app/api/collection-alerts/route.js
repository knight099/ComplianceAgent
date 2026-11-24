import { requireOperator } from "../../../lib/auth.mjs";
import { alerts } from "../../../lib/collection-alerts.mjs";
export const dynamic = "force-dynamic";
export async function GET(req) {
  const denied = await requireOperator(req);
  if (denied) return denied;
  return Response.json(await alerts(), {
    headers: { "Cache-Control": "no-store" },
  });
}
