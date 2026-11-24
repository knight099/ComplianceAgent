import test from "node:test";
import assert from "node:assert/strict";
import { providers, complete } from "../lib/ai.mjs";
const settings = {
  provider: "private",
  model: "internal-small",
  key: "test-only",
};
const endpoints = providers(
  '{"private":"https://models.internal/v1/chat/completions"}',
);
test("test and summary requests use the selected connection and keep credentials out of prompts", async () => {
  for (const summary of [
    undefined,
    { retained: 2, unknown: 1, stale: false },
  ]) {
    const answer = await complete(
      endpoints,
      settings,
      summary,
      async (url, init) => {
        assert.equal(url, endpoints.private);
        assert.equal(init.redirect, "error");
        assert.equal(init.headers.Authorization, "Bearer test-only");
        const body = JSON.parse(init.body);
        assert.equal(body.model, settings.model);
        assert.ok(!init.body.includes(settings.key));
        if (summary)
          assert.deepEqual(JSON.parse(body.messages.at(-1).content), summary);
        else assert.match(body.messages[0].content, /confirm connectivity/);
        return Response.json({
          choices: [{ message: { content: "Verified" } }],
        });
      },
    );
    assert.equal(answer, "Verified");
  }
});
test("unapproved providers, remote plaintext and invalid provider responses fail closed", async () => {
  assert.throws(() => providers('{"bad":"http://public.example/chat"}'));
  await assert.rejects(
    complete(endpoints, { ...settings, provider: "other" }, null, () =>
      assert.fail(),
    ),
    /Invalid/,
  );
  await assert.rejects(
    complete(
      endpoints,
      settings,
      null,
      async () => new Response("private error", { status: 401 }),
    ),
    /HTTP 401/,
  );
  await assert.rejects(
    complete(endpoints, settings, null, async () => Response.json({})),
    /no text/,
  );
});
