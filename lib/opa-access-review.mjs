export const accessRule = "complyos/access_review/v1/decision";
export const accessRevision = "1.0.0";


function secureOrigin(origin) {
  const url = new URL(origin);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password ||
      !(url.protocol === "https:" || (loopback && url.protocol === "http:"))) {
    throw Error("Expected an HTTPS origin or HTTP on loopback");
  }
  return url;
}

export async function activeBundleRevision(control, policy, token, send = fetch) {
  if (!policy || !token) throw Error("Configure POLICY_ID and RELAY_TOKEN");
  const url = secureOrigin(control);
  url.pathname = "/api/v1/policy-bundles";
  url.search = new URLSearchParams({policy, format:"revision"});
  const response = await send(url, {headers:{Authorization:"Bearer " + token}, redirect:"error", signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw Error("Active policy revision unavailable");
  const {revision} = await response.json();
  if (!/^[a-f0-9]{64}$/.test(revision)) throw Error("Invalid bundle revision");
  return revision;
}

export async function loadBundlePolicy(origin, revision, send = fetch) {
  const url = secureOrigin(origin);
  url.pathname = "/v1/data/complyos/approved";
  const response = await send(url, {redirect:"error", signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw Error("Signed policy unavailable");
  const {result} = await response.json();
  if (result?.revision !== revision || !result.definition) throw Error("Waiting for active signed policy");
  return result.definition;
}

// Collection and exception matching happen locally. Only outcome inputs are sent for evaluation.
export async function evaluateAccessReview(report, origin, send = fetch) {
  const url = secureOrigin(origin);
  url.pathname = "/v1/data/" + accessRule;
  const rows = report.rows.map(row => ({ expected: row.expected, observed: row.observed, exception_active: row.exception !== null }));
  const response = await send(url, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: { revision: accessRevision, rows } }),
  });
  if (!response.ok) throw Error("OPA access review unavailable");
  const { result } = await response.json();
  if (result?.revision !== accessRevision || !Array.isArray(result.outcomes) ||
      result.outcomes.length !== rows.length || result.outcomes.some((value, index) => value !== report.rows[index].outcome))
    throw Error("OPA access review is incomplete or disagrees with the pinned rule");
  return { ...report, evaluator: {engine:"opa", rule:accessRule, revision:accessRevision},
    rows: report.rows.map((row, index) => ({ ...row, outcome:result.outcomes[index] })) };
}
