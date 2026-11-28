import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { execFileSync, spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { bundleRevision } from "../lib/policy-bundle.mjs";
import { activeBundleRevision, loadBundlePolicy, evaluateAccessReview } from "../lib/opa-access-review.mjs";

test("managed reviews stop on unavailable registry or stale OPA data", async () => {
  await assert.rejects(activeBundleRevision("http://external","id","secret"), /HTTPS/);
  await assert.rejects(activeBundleRevision("https://example.org","id","secret",async () => new Response(null,{status:503})), /unavailable/);
  await assert.rejects(loadBundlePolicy("http://localhost","current",async () => Response.json({result:{revision:"old",definition:{}}})), /Waiting/);
});

test("OPA downloads a signed SOP and evaluator and rejects a different signing key", {skip:!process.env.OPA_BIN}, async t => {
  const tmp = await mkdtemp(join(tmpdir(), "policy-bundle-"));
  t.after(() => rm(tmp,{recursive:true,force:true}));
  const definition = {id:"personal data",source:"db",version:"1",reviewer:"owner",reference:"SOP",datasets:[]};
  const revision = bundleRevision("org", definition);
  const file = join(tmp,"sop.json");
  const key = join(tmp,"key.pem");
  const pub = join(tmp,"public.pem");
  await writeFile(file,JSON.stringify(definition));
  const pair = generateKeyPairSync("rsa",{modulusLength:2048});
  await writeFile(key,pair.privateKey.export({format:"pem",type:"pkcs8"}));
  await writeFile(pub,pair.publicKey.export({format:"pem",type:"spki"}));
  execFileSync(process.execPath,["scripts/sign-policy-bundle.mjs","org",file,key,tmp]);
  const archive = join(tmp,revision+".tar.gz");
  const other = generateKeyPairSync("rsa",{modulusLength:2048});
  const wrong = join(tmp,"wrong.pem");
  await writeFile(wrong,other.publicKey.export({format:"pem",type:"spki"}));
  assert.throws(() => execFileSync(process.env.OPA_BIN,["run","--bundle",archive,"--verification-key",wrong,"--format","json","data"],{stdio:"pipe"}),/signature|verification/i);
  const bytes = await readFile(archive);
  const service = createServer((req,res) => {
    if (req.url !== "/api/v1/policy-bundles?policy=personal%20data" || req.headers.authorization !== "Bearer test-token") {
      res.writeHead(403).end(); return;
    }
    res.writeHead(200,{"content-type":"application/gzip"}).end(bytes);
  });
  service.listen(0,"127.0.0.1");
  await once(service,"listening");
  t.after(() => service.close());
  const listener = createServer();
  listener.listen(0,"127.0.0.1");
  await once(listener,"listening");
  const addr = "127.0.0.1:" + listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const opa = spawn(process.env.OPA_BIN,["run","--server","--addr="+addr,"--config-file","relay/opa-bundles.yaml",
    "--set-file","keys.release.key="+pub],{env:{...process.env, CONTROL_URL:"http://127.0.0.1:"+service.address().port,
      POLICY_ID_ENCODED:encodeURIComponent(definition.id),RELAY_TOKEN:"test-token"},stdio:["ignore","pipe","pipe"]});
  t.after(() => opa.kill());
  let output = "";
  opa.stderr.on("data", chunk => output += chunk);
  opa.stdout.on("data", chunk => output += chunk);
  for (let i=0;i<100 && !output.includes("Bundle loaded and activated successfully");i++) await delay(100);
  assert.match(output,/Bundle loaded and activated successfully/);
  assert.deepEqual(await loadBundlePolicy("http://"+addr,revision),definition);
  const result = await evaluateAccessReview({rows:[{expected:"none", observed:"read", exception:null, outcome:"EXCESS_ACCESS"}]}, "http://"+addr);
  assert.equal(result.rows[0].outcome,"EXCESS_ACCESS");
});
