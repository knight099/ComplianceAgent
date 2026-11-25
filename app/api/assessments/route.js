import { authenticate } from "../../../lib/auth.mjs";
import { saveAssessment } from "../../../lib/store.mjs";
import { parseAssessment } from "../../../packages/connector-sdk/contract.mjs";
export const dynamic = "force-dynamic";
export { GET } from "../v1/assessments/route.js";
export async function POST(req) {
  const relay = await authenticate(req, "relay");
  if (!relay) return new Response(null, { status: 403 });
  const chunks = [];
  let bytes = 0;
  for await (const part of req.body || []) {
    bytes += part.length;
    if (bytes > 4 * 1024 * 1024) return new Response(null, { status: 413 });
    chunks.push(part);
  }
  let a;
  try {
    a = parseAssessment(JSON.parse(Buffer.concat(chunks)));
  } catch {
    return new Response("Invalid assessment", { status: 400 });
  }
  if (relay.source !== null && a.source !== relay.source)
    return new Response(null, { status: 403 });
  await saveAssessment(a, relay.name);
  return Response.json({ id: a.id });
}
