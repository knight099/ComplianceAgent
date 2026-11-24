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
export async function complete(
  endpoints,
  { provider, model, key },
  summary,
  send = fetch,
) {
  if (
    !Object.hasOwn(endpoints, provider) ||
    typeof model !== "string" ||
    !model.trim() ||
    model.length > 200 ||
    typeof key !== "string" ||
    key.length > 8192
  )
    throw Error("Invalid model connection");
  const messages = summary
    ? [
        {
          role: "system",
          content:
            "Explain the supplied PostgreSQL offboarding counts in three sentences. Flag unknown and stale evidence. A scoped privilege check is not proof of actual usage or legal compliance.",
        },
        { role: "user", content: JSON.stringify(summary) },
      ]
    : [{ role: "user", content: "Reply with OK to confirm connectivity." }];
  const res = await send(endpoints[provider], {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: "Bearer " + key } : {}),
    },
    redirect: "error",
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({ model: model.trim(), messages }),
  });
  if (!res.ok) throw Error("Model endpoint returned HTTP " + res.status);
  const content = (await res.json()).choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim())
    throw Error("Model returned no text");
  return content.trim().slice(0, 4000);
}
