import { execFileSync } from "node:child_process";
import { saveEvidence } from "../lib/store.mjs";
const dir = process.argv[2] || ".",
  ref = process.argv[3] || "HEAD";
const git = (...args) =>
  execFileSync("git", ["-C", dir, ...args], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
const commit = git(
  "rev-parse",
  "--verify",
  "--end-of-options",
  ref + "^{commit}",
).trim();
const paths = git("ls-tree", "-r", "--name-only", "-z", commit)
  .split("\0")
  .filter((p) => /\.(jsx?|tsx?|fixture)$/.test(p));
const facts = [];
for (const path of paths) {
  const lines = git("show", commit + ":" + path).split("\n");
  lines.forEach((line, i) => {
    if (
      /console\.(log|info|warn|error)\([^)]*\.(aadhaarNumber|panNumber|customerEmail)\b/.test(
        line,
      )
    )
      facts.push({
        rule: "SOP-SD-01",
        commit,
        path,
        line: i + 1,
        finding: "Personal identifier passed to a logger",
        status: "Potential disclosure",
      });
  });
}
console.log(
  await saveEvidence({
    source: "Code review",
    mode: "Live",
    status: "Observed",
    observed: new Date().toISOString(),
    facts,
  }),
);
