import { GET as session } from "../app/api/v1/operator-session/route.js";
import { gatewayPath } from "../lib/gateway-path.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { requireOperator } from "../lib/auth.mjs";

test("signed operator tokens use current local membership and a dedicated API audience", async t => {
  const dir = await mkdtemp(join(tmpdir(), "comply-oidc-"));
  t.after(() => rm(dir, {recursive:true, force:true}));
  process.env.AUTH_MODE = "oidc";
  process.env.OIDC_CONFIG_FILE = join(dir,"issuer.json");
  const issuer = "https://login.example.test", audience = "complyos-api";
  const {privateKey,publicKey} = await generateKeyPair("RS256");
  const jwksUri = issuer + "/keys";
  const jwk = {...await exportJWK(publicKey), kid:"key1", alg:"RS256"};
  t.mock.method(globalThis,"fetch", async url => {
    assert.equal(String(url), jwksUri);
    return Response.json({keys:[jwk]});
  });
  async function configure(members) {
    await writeFile(process.env.OIDC_CONFIG_FILE, JSON.stringify({issuer,audience,jwksUri,members}));
  }
  const membership = {subject:"employee",organization:"acme",role:"reviewer"};
  await configure([membership]);
  async function request(overrides = {}, typ = "at+jwt", key = privateKey) {
    const token = await new SignJWT({iss:issuer,aud:audience,sub:"employee",exp:Math.floor(Date.now()/1000)+120,
      organization_id:"unrelated",role:"analyst",...overrides}).setIssuedAt()
      .setProtectedHeader({alg:"RS256",kid:"key1",typ}).sign(key);
    return new Request("https://app.example/api", {headers:{authorization:"Bearer "+token}});
  }
  const req = await request();
  const authenticated = await session(req);
  const metadata = await authenticated.json();
  assert.deepEqual(metadata, { organization: "acme", role: "reviewer", expiresAt: metadata.expiresAt });
  assert.ok(metadata.expiresAt > Date.now()/1000);
  assert.match(authenticated.headers.get("cache-control"), /no-store/);
  assert.equal((await requireOperator(req)).organization_id,"acme");
  assert.equal((await requireOperator(req,{ai:true})).status,403);
  for (const invalid of [await request({iss:"https://other.test"}),await request({aud:"different-api"}),
    await request({sub:"unknown"}),await request({exp:1}),await request({nbf:Date.now()}),
    await request({}, "JWT"),await request({}, "at+jwt", (await generateKeyPair("RS256")).privateKey)]) {
    const denied = await requireOperator(invalid);
    assert.equal(denied.status,401);
    assert.match(denied.headers.get("WWW-Authenticate"),/^Bearer/);
  }
  await configure([{...membership,role:"analyst"}]);
  assert.equal((await requireOperator(req,{ai:true})).ai_enabled,true);
  await configure([membership,{...membership,organization:"other"}]);
  assert.equal((await requireOperator(req)).status,401);
  await configure([]);
  assert.equal((await session(req)).status,401);
  assert.equal((await requireOperator(req)).status,401);
});


test("gateway actions link only to same-origin paths", () => {
  assert.equal(gatewayPath("/oauth2/sign_out"), "/oauth2/sign_out");
  assert.equal(gatewayPath(undefined), null);
  for (const value of ["//other.test", "https://other.test", "/%2fother", "/signout?redirect=https://other.test"])
    assert.throws(() => gatewayPath(value));
});
