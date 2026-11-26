import { requireOperator } from "../../../lib/auth.mjs";
import { assessmentHistory } from "../../../lib/store.mjs";
import { compareAssessments } from "../../../lib/history.mjs";
export const dynamic = "force-dynamic";
const reply = (data, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(req) {
  const operator = await requireOperator(req);
  if (operator instanceof Response) return operator;
  const q = new URL(req.url).searchParams,
    source = q.get("source"),
    before = q.get("before"),
    after = q.get("after");
  if (!source) return reply({ error: "Source required" }, 400);
  if (before === null && after === null)
    return reply(await assessmentHistory(source, [], operator.organization_id));
  const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
  if (!uuid.test(before) || !uuid.test(after) || before === after)
    return reply({ error: "Choose two distinct assessment IDs" }, 400);
  const runs = await assessmentHistory(source, [before, after], operator.organization_id);
  if (runs.length !== 2)
    return reply({ error: "Assessment missing from this source" }, 404);
  const first = runs.find((r) => r.id === before.toLowerCase()),
    second = runs.find((r) => r.id === after.toLowerCase());
  if (!(first.collected_at < second.collected_at))
    return reply(
      { error: "Later assessment must follow the earlier collection" },
      400,
    );
  return reply(compareAssessments(first, second));
}
