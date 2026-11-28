import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { authenticate } from "../../../../lib/auth.mjs";
import { scopedQuery } from "../../../../lib/store.mjs";
import { bundleRevision } from "../../../../lib/policy-bundle.mjs";

export const dynamic = "force-dynamic";
const headers = {"Cache-Control":"private, no-store"};
export async function GET(req) {
  const relay = await authenticate(req, "relay");
  if (!relay?.source) return new Response(null, {status:403, headers});
  const params = new URL(req.url).searchParams;
  const policy = params.get("policy");
  if (!policy) return new Response(null, {status:400, headers});
  const {rows} = await scopedQuery("assessment", relay.organization_id,
    `SELECT definition FROM policy_revisions WHERE organization_id=$1 AND source=$2
     AND policy_id=$3 AND effective_at<=statement_timestamp() ORDER BY effective_at DESC LIMIT 1`,
    [relay.organization_id, relay.source, policy]);
  if (!rows.length) return new Response(null, {status:404, headers});
  const revision = bundleRevision(relay.organization_id, rows[0].definition);
  if (params.get("format") === "revision") return Response.json({revision}, {headers});
  try {
    const body = await readFile(join(process.env.POLICY_BUNDLE_DIR || ".data/policy-bundles", revision + ".tar.gz"));
    return new Response(body, {headers:{...headers, "Content-Type":"application/gzip"}});
  } catch (error) {
    if (error.code === "ENOENT") return new Response(null, {status:503, headers});
    throw error;
  }
}
