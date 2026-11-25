import { requireOperator } from "../../../../lib/auth.mjs";
import { latest } from "../../../../lib/store.mjs";
export const dynamic = "force-dynamic";
export async function GET(req) {
  const denied = await requireOperator(req);
  if (denied) return denied;
  return Response.json(await latest(), {
    headers: { "Cache-Control": "no-store" },
  });
}
