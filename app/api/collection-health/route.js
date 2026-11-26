import { requireOperator } from "../../../lib/auth.mjs";
import { collectionHealth } from "../../../lib/collection-health.mjs";
export const dynamic = "force-dynamic";
export async function GET(req) {
  const operator = await requireOperator(req);
  if (operator instanceof Response) return operator;
  return Response.json(await collectionHealth(undefined, operator.organization_id), {
    headers: { "Cache-Control": "no-store" },
  });
}
