import test from "node:test";
import assert from "node:assert/strict";
import { accessOutcome } from "../lib/access-review-contract.mjs";
import { evaluateAccessReview, accessRevision } from "../lib/opa-access-review.mjs";

const rows = [];
for (const expected of [null,"none","read"]) {
  for (const observed of [null,"none","read"]) {
    for (const exception of [null,{reference:"restricted-reference"}]) {
      rows.push({employeeId:"private-subject", expected, observed, exception, outcome:accessOutcome(expected, observed, exception)});
    }
  }
}
const results = rows.map(row => row.outcome);
test("versioned evaluation sends minimal ordered inputs and preserves matching outcomes", async () => {
  const loaded = await evaluateAccessReview({rows}, "http://localhost:8181", async (url, init) => {
    assert.equal(url.href, "http://localhost:8181/v1/data/complyos/access_review/v1/decision");
    assert.deepEqual(JSON.parse(init.body).input, {revision: accessRevision, rows: rows.map(r=>({
      expected:r.expected, observed:r.observed, exception_active:r.exception !== null,
    }))});
    return Response.json({result:{revision:accessRevision,outcomes:results}});
  });
  assert.deepEqual(loaded.rows,rows);
  assert.equal(loaded.evaluator.revision,accessRevision);
});
test("missing policy, drift, incomplete decisions and unavailable transport stop the review", async () => {
  for (const body of [{}, {result:{revision:"old", outcomes:results}}, {result:{revision:accessRevision,outcomes:[]}},
    {result:{revision:accessRevision,outcomes:results.toReversed()}}]) {
    await assert.rejects(evaluateAccessReview({rows},"https://opa.internal",async()=>Response.json(body)),/incomplete/);
  }
  await assert.rejects(evaluateAccessReview({rows},"https://opa.internal",async()=>new Response(null,{status:503})),/unavailable/);
  await assert.rejects(evaluateAccessReview({rows},"http://opa.internal",()=>assert.fail()),/HTTPS/);
});
test("deployed Rego agrees with all 18 input combinations and an empty review", {skip: !process.env.TEST_OPA_ORIGIN}, async () => {
  for (const batch of [rows, []]) {
    const report = await evaluateAccessReview({rows:batch}, process.env.TEST_OPA_ORIGIN);
    assert.deepEqual(report.rows,batch);
  }
});
