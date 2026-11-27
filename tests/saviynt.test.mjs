import test from "node:test";
import assert from "node:assert/strict";
import { collectSaviynt, attachGovernance } from "../connectors/saviynt/index.mjs";
import { buildAccessReport } from "../lib/access-report.mjs";
import { validateAccessReport } from "../lib/access-review-contract.mjs";

const config = { origin: "https://tenant.example", source: "finance", analyticsName: "Reviewed grants" };
const record = { recordId: "approval-7", employeeId: "e1", account: "db1", schema: "private", table: "kyc",
  entitlement: "read-kyc", approvedRole: "Lending", status: "approved", expiresAt: "2026-01-01T00:00:00Z" };
async function review() {
  const now = new Date(), resource = ["private","kyc"];
  return buildAccessReport({ source:"finance", hrObserved:now.toISOString(), hrRevision:"hr7", resources:[resource],
    employees:[{id:"e1",role:"db1",businessRole:"Marketing",status:"active"}] },
  {source:"finance",id:"KYC",version:"1",reviewer:"owner",reference:"SOP",datasets:[{resource,classification:"restricted",roles:{Marketing:"none"}}]},
  async () => ({rows:[{resource_known:true,identity_known:true,readable_as:["db1"],grantees:["db1"],paths:[["db1"]]}]}), now);
}

test("links paginated governance records to exact account and table without changing access outcome", async () => {
  const offsets = [];
  const snapshot = await collectSaviynt(config,"finance","fixture",async (url, init) => {
    assert.equal(url.href,"https://tenant.example/ECM/api/v5/fetchRuntimeControlsDataV2");
    assert.equal(init.redirect,"error");
    assert.equal(init.headers.Authorization,"Bearer fixture");
    const {analyticsname,offset} = JSON.parse(init.body);
    assert.equal(analyticsname,config.analyticsName);
    offsets.push(offset);
    return Response.json({totalcount:"2",results:[offset ? {...record, recordId:"unrelated", account:"db2"} : record]});
  });
  assert.deepEqual(offsets,[0,1]);
  const report = await review();
  attachGovernance(report,snapshot);
  validateAccessReport(JSON.parse(JSON.stringify(report)));
  assert.equal(report.saviynt.coverage,"observed");
  assert.deepEqual(report.rows[0].governance,[record]);
  assert.equal(report.rows[0].businessRole,"Marketing");
  assert.equal(report.rows[0].outcome,"EXCESS_ACCESS");
  report.rows[0].governance[0].account = "other";
  assert.throws(() => validateAccessReport(report));
});

test("lost credentials, duplicate pages and interrupted reads leave coverage unknown", async () => {
  for (const next of [new Response(null,{status:401}), Response.json({totalcount:2,results:[]}),
    Response.json({totalcount:2,results:[record]}), Response.json({errorCode:"1",results:[],totalcount:0})]) {
    let calls = 0;
    const snapshot = await collectSaviynt(config,"finance","fixture",async () => ++calls === 1
      ? Response.json({totalcount:2,results:[record]}) : next);
    assert.equal(snapshot.coverage,"unavailable");
    const report = await review();
    attachGovernance(report,snapshot);
    validateAccessReport(report);
    assert.deepEqual(report.rows[0].governance,[]);
    assert.equal(report.rows[0].outcome,"EXCESS_ACCESS");
  }
  await assert.rejects(collectSaviynt(config,"wrong-source","fixture",() => assert.fail()));
  const empty = await collectSaviynt(config,"finance","fixture",async () => Response.json({totalcount:0,results:[]}));
  assert.equal(empty.coverage,"observed");
});
