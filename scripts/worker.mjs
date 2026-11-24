import { spawnSync } from "node:child_process";
const interval = Number(process.env.SCAN_INTERVAL_SECONDS || 900);
if (!Number.isFinite(interval) || interval < 30)
  throw Error("Minimum scan interval is 30 seconds");
async function collect() {
  for (const [op, arg] of [
    ["aws", process.env.SANDBOX_ACCOUNT],
    ["github", process.env.GITHUB_REPO],
  ]) {
    if (!arg) continue;
    const result = spawnSync(
      process.execPath,
      ["scripts/evidence.mjs", op, arg],
      { stdio: "inherit", timeout: 90000 },
    );
    if (result.status !== 0) console.error(op + " import failed");
  }
}
await collect();
setInterval(collect, interval * 1000);
