import { requireOperator } from "../../../../lib/auth.mjs";
import { evidenceById } from "../../../../lib/store.mjs";

export const dynamic = "force-dynamic";
const reply = (data, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req) {
  const operator = await requireOperator(req);
  if (operator instanceof Response) return operator;
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^[0-9a-f]{64}$/.test(id)) return reply({ error: "Invalid evidence ID" }, 400);
  const evidence = await evidenceById(id, operator.organization_id);
  return evidence ? reply(evidence) : reply({ error: "Evidence not found" }, 404);
}
