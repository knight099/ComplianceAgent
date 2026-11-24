import { requireOperator } from "../../../lib/auth.mjs";
import { collectionHealth } from "../../../lib/collection-health.mjs";
export const dynamic = "force-dynamic";
export async function GET(req) {
  const denied = await requireOperator(req);
  if (denied) return denied;
  return Response.json(await collectionHealth(), {
    headers: { "Cache-Control": "no-store" },
  });
}
