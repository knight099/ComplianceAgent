import { requireOperator } from "../../../lib/auth.mjs";
import { alerts } from "../../../lib/collection-alerts.mjs";
import { deliveryStatus } from "../../../lib/delivery-status.mjs";
export const dynamic = "force-dynamic";
export async function GET(req) {
  const denied = await requireOperator(req);
  if (denied) return denied;
  const [state, webhooks] = await Promise.all([alerts(), deliveryStatus()]);
  return Response.json(
    { ...state, webhooks },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
