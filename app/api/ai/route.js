import { requireOperator } from "../../../lib/auth.mjs";
import { assessmentCounts } from "../../../lib/store.mjs";
import { modelConnections, complete } from "../../../lib/ai.mjs";
export const dynamic = "force-dynamic";
const reply = (data, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(req) {
  const operator = await requireOperator(req, { ai: true });
  if (operator instanceof Response) return operator;
  try {
    const connections = modelConnections(operator.organization_id);
    return reply({ providers: Object.keys(connections), models: Object.fromEntries(
      Object.entries(connections).map(([name, connection]) => [name, connection.models])) });
  } catch {
    return reply({ error: "Model configuration unavailable." }, 503);
  }
}
export async function POST(req) {
  const operator = await requireOperator(req, { ai: true });
  if (operator instanceof Response) return operator;
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
    summary = await assessmentCounts(input.id, operator.organization_id);
    if (!summary) return reply({ error: "Assessment unavailable" }, 404);
  }
  try {
    const text = await complete(modelConnections(operator.organization_id), input, summary);
    return reply({ text: summary ? text : "Connection verified", summary });
  } catch (e) {
    if (e.message === "Model privacy policy blocked request") return reply({ error: e.message }, 400);
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
