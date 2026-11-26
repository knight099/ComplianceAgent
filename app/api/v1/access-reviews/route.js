import { createHash } from "node:crypto";
import { authenticate, requireOperator } from "../../../../lib/auth.mjs";
import { scopedQuery } from "../../../../lib/store.mjs";
import { validateAccessReport } from "../../../../lib/access-review-contract.mjs";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const relay = await authenticate(req, "relay");
  if (!relay) return new Response(null, { status: 403 });
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req.body || []) {
    bytes += chunk.length;
    if (bytes > 4 * 1024 * 1024) return new Response(null, { status: 413 });
    chunks.push(chunk);
  }
  let report;
  try {
    report = JSON.parse(Buffer.concat(chunks));
    validateAccessReport(report);
  } catch {
    return new Response("Invalid access review", { status: 400 });
  }
  if (relay.source !== null && report.source !== relay.source) return new Response(null, { status: 403 });
  const payload = JSON.stringify(report);
  const id = createHash("sha256").update(payload).digest("hex");
  await scopedQuery("assessment", relay.organization_id,
    "INSERT INTO access_reviews (organization_id,id,source,observed_at,submitted_by,report) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
    [relay.organization_id, id, report.source, report.observedAt, relay.name, payload]);
  return Response.json({ id });
}

export async function GET(req) {
  const operator = await requireOperator(req);
  if (operator instanceof Response) return operator;
  const id = new URL(req.url).searchParams.get("id");
  const read = (sql, params) => scopedQuery("assessment", operator.organization_id, sql, params);
  const headers = { "Cache-Control": "no-store" };
  if (id !== null) {
    const { rows } = await read("SELECT report FROM access_reviews WHERE organization_id=$1 AND id=$2", [operator.organization_id, id]);
    return rows.length ? Response.json(rows[0].report, { headers }) : new Response(null, { status: 404, headers });
  }
  const { rows } = await read(`SELECT id,source,observed_at,submitted_by,report->'policy'->>'id' AS policy_id,
    report->'policy'->>'version' AS version FROM access_reviews WHERE organization_id=$1 ORDER BY observed_at DESC,id`, [operator.organization_id]);
  return Response.json(rows, { headers });
}
