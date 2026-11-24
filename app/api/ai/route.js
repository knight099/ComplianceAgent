import { requireOperator } from "../../../lib/auth.mjs";
import { assessmentCounts } from "../../../lib/store.mjs";
import { providers, complete } from "../../../lib/ai.mjs";
export const dynamic = "force-dynamic";
const reply = (data, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(req) {
  const denied = await requireOperator(req);
  if (denied) return denied;
  return reply({ providers: Object.keys(providers()) });
}
export async function POST(req) {
  const denied = await requireOperator(req);
  if (denied) return denied;
  if (req.headers.get("content-type") !== "application/json")
    return reply({ error: "JSON required" }, 415);
  const chunks = [];
  let size = 0;
  for await (const part of req.body || []) {
    size += part.length;
    if (size > 16384) return reply({ error: "Request too large" }, 413);
    chunks.push(part);
  }
  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks));
  } catch {
    return reply({ error: "Invalid JSON" }, 400);
  }
  if (!input || !["test", "explain"].includes(input.op))
    return reply({ error: "Unknown operation" }, 400);
  let summary;
  if (input.op === "explain") {
    if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(input.id))
      return reply({ error: "Invalid assessment ID" }, 400);
    summary = await assessmentCounts(input.id);
    if (!summary) return reply({ error: "Assessment unavailable" }, 404);
  }
  try {
    const text = await complete(providers(), input, summary);
    return reply({ text: summary ? text : "Connection verified", summary });
  } catch (e) {
    return reply(
      {
        error: /^Model endpoint returned HTTP \d{3}$/.test(e.message)
          ? e.message
          : "Connection failed. Check the endpoint, model and API key.",
      },
      502,
    );
  }
}
