import { requireOperator } from "../../../lib/auth.mjs";
import { alerts } from "../../../lib/collection-alerts.mjs";
import { deliveryStatus } from "../../../lib/delivery-status.mjs";
import { organizationTransaction } from "../../../lib/store.mjs";

export const dynamic = "force-dynamic";
export async function GET(req) {
  const operator = await requireOperator(req);
  if (operator instanceof Response) return operator;
  const org = operator.organization_id;
  const data = await organizationTransaction("alertReader", org, async client => ({
    ...await alerts(client, org),
    webhooks: await deliveryStatus(client, org),
  }));
  return Response.json(
    data,
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
