import { requireOperator } from "../../../lib/auth.mjs";
import { alerts } from "../../../lib/collection-alerts.mjs";
import { deliveryStatus } from "../../../lib/delivery-status.mjs";
export const dynamic = "force-dynamic";
export async function GET(req) {
  const operator = await requireOperator(req);
  if (operator instanceof Response) return operator;
  const [state, webhooks] = await Promise.all([
    alerts(undefined, operator.organization_id),
    deliveryStatus(undefined, operator.organization_id),
  ]);
  return Response.json(
    { ...state, webhooks },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
