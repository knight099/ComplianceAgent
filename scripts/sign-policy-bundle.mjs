import { execFileSync } from "node:child_process";
import { copyFile, link, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { bundleRevision } from "../lib/policy-bundle.mjs";
import { indexPolicy } from "../policies/access-review/v1/semantics.mjs";

const [organization, file, key, directory] = process.argv.slice(2);
if (!organization || !file || !key || !directory) throw Error("Supply organization, SOP JSON, RSA private key and output directory");
const definition = JSON.parse(await readFile(file, "utf8"));
indexPolicy(definition, definition.source, Date.now());
const revision = bundleRevision(organization, definition);
await mkdir(directory, {recursive:true});
const temp = await mkdtemp(join(directory, ".publish-"));
try {
  const src = join(temp, "src");
  await mkdir(src);
  await copyFile(new URL("../policies/access-review/v1/policy.rego", import.meta.url), join(src, "policy.rego"));
  await writeFile(join(src, "data.json"), JSON.stringify({complyos:{approved:{revision,definition}}}));
  await writeFile(join(src, ".manifest"), JSON.stringify({revision, roots:["complyos"], rego_version:1}));
  const archive = join(temp, "bundle.tar.gz");
  execFileSync(process.env.OPA_BIN || "opa", ["build", "--bundle", src, "--signing-key", resolve(key),
    "--signing-alg", "RS256", "--output", archive], {stdio:"inherit"});
  const dest = join(directory, revision + ".tar.gz");
  await link(archive, dest);
  console.log(dest);
} finally {
  await rm(temp, {recursive:true, force:true});
}
