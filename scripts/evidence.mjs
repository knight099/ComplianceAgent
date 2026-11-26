import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { verifyDeviceUpload } from "../lib/evidence.mjs";
import { saveEvidence } from "../lib/store.mjs";
const [op, arg, enrollmentOrganization = "installation"] = process.argv.slice(2),
  read = (p) => JSON.parse(readFileSync(p, "utf8"));
const dir = process.env.DATA_DIR || ".data",
  keys = process.env.DEVICE_KEYS_FILE || dir + "/devices.json";
mkdirSync(dir, { recursive: true, mode: 0o700 });
if (op === "enroll") {
  if (!arg || arg === "__proto__" || !/^[a-zA-Z0-9_-]{1,64}$/.test(arg) || !enrollmentOrganization.trim())
    throw Error("Invalid device identifier");
  const known = existsSync(keys) ? read(keys) : {};
  if (Object.hasOwn(known, arg)) throw Error("Device already enrolled");
  const key = randomBytes(32).toString("hex");
  known[arg] = { key, organization: enrollmentOrganization };
  writeFileSync(keys, JSON.stringify(known), { mode: 0o600 });
  writeFileSync(
    dir + "/" + arg + ".json",
    JSON.stringify({ device: arg, key }),
    { mode: 0o600, flag: "wx" },
  );
} else {
  let e, organization = "installation";
  if (op === "bundle") {
    ({ observation: e, organization } = verifyDeviceUpload(read(arg), read(keys)));
  } else {
    const run = (binary, args) =>
      JSON.parse(
        execFileSync(binary, args, {
          encoding: "utf8",
          timeout: 60000,
          stdio: ["ignore", "pipe", "pipe"],
        }),
      );
    let facts = [],
      status = "Observed",
      mode = "Live",
      source = op;
    try {
      if (op === "aws") {
        const aws = (...args) =>
          run("aws", [...args, "--output", "json", "--no-cli-pager"]);
        const acct = aws("sts", "get-caller-identity").Account;
        if (acct !== process.env.SANDBOX_ACCOUNT)
          throw Error("Sandbox account mismatch");
        const user = process.env.SANDBOX_USER;
        const groups = aws(
          "iam",
          "list-groups-for-user",
          "--user-name",
          user,
        ).Groups;
        facts = groups.map((g) => ({
          account: acct,
          user,
          group: g.GroupName,
          scope: "Observed IAM membership",
        }));
      } else if (op === "github") {
        if (!/^[\w.-]+\/[\w.-]+$/.test(arg)) throw Error("Expected owner/repo");
        const repo = run("gh", ["api", "repos/" + arg]);
        const branch = run("gh", [
          "api",
          "repos/" +
            arg +
            "/branches/" +
            encodeURIComponent(repo.default_branch) +
            "/protection",
        ]);
        facts = [
          {
            repo: arg,
            branch: repo.default_branch,
            requiredReviews:
              branch.required_pull_request_reviews
                ?.required_approving_review_count ?? 0,
          },
        ];
      } else if (op === "trivy") {
        mode = "Imported";
        facts = (read(arg).Results || []).flatMap((r) => [
          ...(r.Secrets || []).map((f) => ({
            target: r.Target,
            rule: f.RuleID,
            line: f.StartLine,
            severity: f.Severity,
          })),
          ...(r.Misconfigurations || []).map((f) => ({
            target: r.Target,
            rule: f.ID,
            severity: f.Severity,
            status: f.Status,
          })),
        ]);
      } else if (op === "prowler") {
        mode = "Imported";
        const input = read(arg);
        facts = input.map((f) => ({
          check: f.metadata?.event_code || f.finding_info?.uid,
          status: f.status_code,
          resources: f.resources?.map((r) => r.uid),
          scanTime: f.time,
        }));
      } else throw Error("Unknown adapter");
    } catch (err) {
      if (!["aws", "github"].includes(op)) throw err;
      status = "Unknown";
      facts = [
        {
          scope: op,
          reason:
            "Collection failed; check permissions, sandbox selection and CLI availability.",
        },
      ];
    }
    e = { source, mode, status, observed: new Date().toISOString(), facts };
  }
  console.log(await saveEvidence(e, organization));
}
process.exitCode = 0;
