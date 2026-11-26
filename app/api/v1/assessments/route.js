import { requireOperator } from "../../../../lib/auth.mjs";
import { latest } from "../../../../lib/store.mjs";
export const dynamic = "force-dynamic";
export async function GET(req) {
  const operator = await requireOperator(req);
  if (operator instanceof Response) return operator;
  return Response.json(await latest(operator.organization_id), {
    headers: { "Cache-Control": "no-store" },
  });
}
