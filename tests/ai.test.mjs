import test from "node:test";
import assert from "node:assert/strict";
import { providers, modelConnections, complete } from "../lib/ai.mjs";

const env = {
  AI_ENDPOINTS: '{"private":"http://localhost:11434/v1/chat/completions","hosted":"https://models.example/v1/chat/completions"}',
  AI_MODELS: '{"private":["internal-small"],"hosted":["external-small"]}',
  AI_TENANT_PROVIDERS: '{"one":["private","hosted"],"two":["private"]}',
};
const settings = { provider: "private", model: "internal-small", key: "test-only-secret", op: "explain" };
const summary = { collected_at: new Date("2026-01-02T00:00:00Z"), retained: 0, unknown: 4, no_scoped_grant: 28, stale: false };
const connections = modelConnections("one", env);
test("approved transports receive only the fixed probe or masked aggregate", async t => {
  const audit = t.mock.method(console, "info", () => {});
  for (const [provider, { endpoint, models }] of Object.entries(connections)) {
    for (const op of ["test", "explain"]) {
      const answer = await complete(connections, { ...settings, provider, model: models[0], op, id: "local-only-assessment" },
        op === "explain" ? summary : undefined, async (url, init) => {
          assert.equal(url, endpoint);
          assert.equal(init.headers.Authorization, "Bearer test-only-secret");
          assert.equal(init.redirect, "error");
          const body = JSON.parse(init.body);
          assert.deepEqual(Object.keys(body), ["model", "messages"]);
          assert.equal(body.model, models[0]);
          assert.doesNotMatch(init.body, /test-only-secret|local-only-assessment|2026-01-02|28/);
          if (op === "test") assert.deepEqual(body.messages, [{ role: "user", content: "Reply with OK to confirm connectivity." }]);
          else assert.deepEqual(JSON.parse(body.messages[1].content), { retained: "0-4", unknown: "0-4", no_scoped_grant: "10-49", stale: false });
          return Response.json({ choices: [{ message: { content: "Verified" } }] });
        });
      assert.equal(answer, "Verified");
    }
  }
  assert.equal(audit.mock.callCount(), 4);
  assert.ok(audit.mock.calls.every(c => c.arguments.length === 3 && c.arguments[0] === "complyos.model-privacy/v1" && c.arguments[1] === "allowed"));
});

test("unknown fields, sensitive content, disallowed models and disabled destinations produce zero calls", async t => {
  const audit = t.mock.method(console, "info", () => {});
  let calls = 0;
  const secret = "employee@example.invalid";
  for (const [input, data, allowed] of [
    [settings, { ...summary, evidence: { email: secret } }],
    [settings, { ...summary, retained: secret }],
    [settings, { ...summary, unknown: -1 }],
    [settings, { ...summary, stale: { email: secret } }],
    [settings, { ...summary, collected_at: secret }],
    [settings, undefined],
    [{ ...settings, op: "test" }, summary],
    [{ ...settings, prompt: secret }, summary],
    [{ ...settings, model: secret }, summary],
    [settings, summary, modelConnections("missing", env)],
    [{ ...settings, provider: "hosted", model: "external-small" }, summary, modelConnections("two", env)],
  ]) await assert.rejects(complete(allowed ?? connections, input, data, () => { calls++; }), /privacy policy/);
  assert.equal(calls, 0);
  assert.ok(audit.mock.calls.every(c => JSON.stringify(c.arguments) === '["complyos.model-privacy/v1","blocked"]'));
});

test("invalid configuration fails closed and provider errors omit remote content", async () => {
  assert.throws(() => providers('{"bad":"http://public.example/chat"}'));
  assert.throws(() => modelConnections("one", { ...env, AI_TENANT_PROVIDERS: 'null' }));
  assert.deepEqual(modelConnections("one", { ...env, AI_MODELS: '{}' }), {});
  await assert.rejects(complete(connections, settings, summary, async () => new Response("private error", {status:401})), /^Error: Model endpoint returned HTTP 401$/);
  await assert.rejects(complete(connections, settings, summary, async () => Response.json({})), /no text/);
});
