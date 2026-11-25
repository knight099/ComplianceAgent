import pg from "pg";
import { readFile } from "node:fs/promises";
import { readHrInput } from "../connectors/hr/input.mjs";
import { collectDirectoryMatches } from "../connectors/entra/index.mjs";
import { buildAccessReport } from "../lib/access-report.mjs";

const args = process.argv.slice(2);
const useEntra = args.at(-1) === "--entra";
if (useEntra) args.pop();
const [policyFile, input, scopePath] = args;
if (!input || args.length > 3 || !process.env.SOURCE_DATABASE_URL)
  throw Error("Set SOURCE_DATABASE_URL and supply policy.json, HR input, optional CSV scope and optional --entra");
const policy = JSON.parse(await readFile(policyFile, "utf8"));
const feed = await readHrInput(input, scopePath);
if (useEntra && !process.env.ENTRA_ACCESS_TOKEN) throw Error("Configure ENTRA_ACCESS_TOKEN");
const directory = useEntra
  ? await collectDirectoryMatches(feed.employees, process.env.ENTRA_ACCESS_TOKEN)
  : undefined;
const client = new pg.Client({
  connectionString: process.env.SOURCE_DATABASE_URL, connectionTimeoutMillis: 5000,
  statement_timeout: 10000, options: "-c default_transaction_read_only=on",
});
await client.connect();
try {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const report = await buildAccessReport(feed, policy, (sql, args) => client.query(sql, args), new Date(), directory);
  const commit = await client.query("COMMIT");
  if (commit.command !== "COMMIT") throw Error("Catalog snapshot failed. Retry collection");
  console.log(JSON.stringify(report, null, 2));
} finally {
  await client.end();
}
