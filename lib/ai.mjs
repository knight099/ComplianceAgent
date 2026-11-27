export function providers(config = process.env.AI_ENDPOINTS) {
  const endpoints = JSON.parse(
    config || '{"OpenAI":"https://api.openai.com/v1/chat/completions"}',
  );
  if (!endpoints || Array.isArray(endpoints) || typeof endpoints !== "object")
    throw Error("Invalid provider configuration");
  for (const endpoint of Object.values(endpoints)) {
    const url = new URL(endpoint);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !(url.protocol === "https:" || (loopback && url.protocol === "http:"))
    )
      throw Error("Invalid provider endpoint");
  }
  return endpoints;
}
export function modelConnections(organization, env = process.env) {
  const endpoints = providers(env.AI_ENDPOINTS);
  const models = JSON.parse(env.AI_MODELS || '{"OpenAI":["gpt-4o-mini"]}');
  const tenants = env.AI_TENANT_PROVIDERS ? JSON.parse(env.AI_TENANT_PROVIDERS) : null;
  const mapping = value => value && typeof value === "object" && !Array.isArray(value);
  if (!mapping(models) || (env.AI_TENANT_PROVIDERS && !mapping(tenants)))
    throw Error("Invalid model configuration");
  const allowed = tenants === null ? Object.keys(endpoints) :
    Object.hasOwn(tenants, organization) ? tenants[organization] : [];
  if (!Array.isArray(allowed) || !allowed.every(name => typeof name === "string" && Object.hasOwn(endpoints, name)))
    throw Error("Invalid provider access");
  return Object.fromEntries(allowed.filter(name => Object.hasOwn(models, name)).map(name => {
    const ids = models[name];
    if (!Array.isArray(ids) || !ids.every(id => typeof id === "string" && id.trim() === id && id.length > 0 && id.length <= 200))
      throw Error("Invalid approved model IDs");
    return [name, { endpoint: endpoints[name], models: ids }];
  }).filter(([, connection]) => connection.models.length));
}

const policy = "complyos.model-privacy/v1";
const countFields = ["retained", "unknown", "no_scoped_grant"];
function summaryContent(summary) {
  if (!summary || Object.getPrototypeOf(summary) !== Object.prototype ||
      Object.keys(summary).some(key => ![...countFields, "stale", "collected_at"].includes(key)) ||
      (Object.hasOwn(summary, "collected_at") && !(summary.collected_at instanceof Date &&
        Number.isFinite(summary.collected_at.getTime()))) ||
      typeof summary.stale !== "boolean" ||
      !countFields.every(key => Number.isSafeInteger(summary[key]) && summary[key] >= 0))
    throw Error("Invalid aggregate summary");
  const bands = {};
  for (const field of countFields) {
    const n = summary[field];
    bands[field] = n < 5 ? "0-4" : n < 10 ? "5-9" : n < 50 ? "10-49" : "50+";
  }
  return JSON.stringify({ ...bands, stale: summary.stale });
}

export async function complete(connections, input, summary, send = fetch) {
  let request, endpoint;
  try {
    const { op, provider, model, key } = input;
    if (Object.keys(input).some(k => !["op", "id", "provider", "model", "key"].includes(k)) ||
        !["test", "explain"].includes(op) || typeof provider !== "string" || !Object.hasOwn(connections, provider) ||
        typeof model !== "string" || !connections[provider].models.includes(model) ||
        typeof key !== "string" || key.length > 8192 || (op === "test" && summary !== undefined))
      throw Error("Invalid model connection");
    endpoint = connections[provider].endpoint;
    const messages = op === "test" ? [{ role: "user", content: "Reply with OK to confirm connectivity." }] : [
      { role: "system", content: "Explain the PostgreSQL offboarding count ranges and freshness. A 0-4 range includes zero. Avoid inferring exact counts, identities, actual use or legal compliance." },
      { role: "user", content: summaryContent(summary) },
    ];
    request = {
      method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json", ...(key ? { Authorization: "Bearer " + key } : {}) },
      redirect: "error", signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ model, messages }),
    };
  } catch {
    console.info(policy, "blocked");
    throw Error("Model privacy policy blocked request");
  }
  console.info(policy, "allowed", input.op);
  const res = await send(endpoint, request);
  if (!res.ok) throw Error("Model endpoint returned HTTP " + res.status);
  const content = (await res.json()).choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw Error("Model returned no text");
  return content.trim().slice(0, 4000);
}
