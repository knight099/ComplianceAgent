import { requireOperator } from "../../../lib/auth.mjs";
import { alerts } from "../../../lib/collection-alerts.mjs";
import { deliveryStatus } from "../../../lib/delivery-status.mjs";
export const dynamic = "force-dynamic";
export async function GET(req) {
  const operator = await requireOperator(req);
  if (operator instanceof Response) return operator;
  if (operator.organization_id !== "installation")
    return Response.json({ error: "Alert delivery is installation-scoped" }, { status: 403 });
  const [state, webhooks] = await Promise.all([alerts(), deliveryStatus()]);
  return Response.json(
    { ...state, webhooks },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
