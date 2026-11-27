import test from "node:test";
import assert from "node:assert/strict";
import { auditLaptops } from "../connectors/intune/index.mjs";
const now = new Date("2026-11-27T12:00:00Z");
const key = n => "12345678-abcd-1234-1234-" + String(n).padStart(12,"0");
const inventory = { observedAt:now.toISOString(), assets:Array.from({length:7},(_,i)=>({assetId:"asset-"+i, entraDeviceId:key(i)})) };
const device = (i, extra) => ({ id:"managed-"+i, azureADDeviceId:key(i).toUpperCase(),
  lastSyncDateTime:now.toISOString(), isEncrypted:true, ...extra });
const url = "https://graph.microsoft.com/v1.0/deviceManagement/managedDevices";
test("issued assets retain encrypted, disabled, stale, missing, ambiguous and unknown outcomes", async () => {
  const pages = [
    { value:[device(0),device(1,{isEncrypted:false}),device(2,{lastSyncDateTime:"2026-11-01"})], "@odata.nextLink":url+"?page=2" },
    { value:[device(4),device(4,{id:"duplicate-enrollment"}),device(5,{isEncrypted:null}),device(6,{lastSyncDateTime:"2026-12-01"})] },
  ];
  const report = await auditLaptops(inventory,"fixture",async (target,init)=>{
    assert.equal(target.origin+target.pathname,url);
    assert.equal(init.headers.Authorization,"Bearer fixture");
    assert.equal(init.redirect,"error");
    return Response.json(pages.shift());
  },now);
  assert.deepEqual(report.rows.map(r=>r.outcome),["REPORTED_ENCRYPTED","REPORTED_UNENCRYPTED","STALE_DEVICE_EVIDENCE",
    "MISSING_FROM_INTUNE_SCOPE","IDENTITY_NEEDS_REVIEW","ENCRYPTION_UNKNOWN","STALE_DEVICE_EVIDENCE"]);
});
test("rejects incomplete or redirected inventories without reporting absent laptops",async()=>{
  for(const next of ["https://elsewhere.example/devices",url+"?next=2"]){
    let calls=0;
    const report=await auditLaptops(inventory,"fixture",async target=>{
      assert.equal(target.origin,"https://graph.microsoft.com");
      return ++calls===1 ? Response.json({value:[device(0)],"@odata.nextLink":next}) : new Response(null,{status:403});
    },now);
    assert.equal(report.coverage,"unavailable");
    assert.ok(report.rows.every(r=>r.outcome==="COLLECTION_UNAVAILABLE" && r.managedDeviceId===null));
  }
});
test("shared or missing join keys need review; stale inventory cannot establish current coverage",async()=>{
  const assets=[{assetId:"one",entraDeviceId:key(1)},{assetId:"two",entraDeviceId:key(1)},{assetId:"three"}];
  const send=async()=>Response.json({value:[]});
  const review=await auditLaptops({...inventory,assets},"token",send,now);
  assert.ok(review.rows.every(r=>r.outcome==="IDENTITY_NEEDS_REVIEW"));
  const stale=await auditLaptops({...inventory,observedAt:"2026-01-01"},"token",send,now);
  assert.ok(stale.rows.every(r=>r.outcome==="STALE_INVENTORY"));
});

test("an unidentifiable managed device makes an unmatched issued laptop inconclusive",async()=>{
  const report=await auditLaptops(inventory,"token",async()=>Response.json({value:[{id:"unknown-device"}]}),now);
  assert.ok(report.rows.every(r=>r.outcome==="IDENTITY_NEEDS_REVIEW"));
});
