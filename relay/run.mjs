import pg from "pg";
import { readFile } from "node:fs/promises";
import { assess } from "./offboarding.mjs";
const endpoint = new URL(process.env.CONTROL_URL);
if (
  endpoint.protocol !== "https:" &&
  !(
    ["localhost", "127.0.0.1"].includes(endpoint.hostname) &&
    endpoint.protocol === "http:"
  )
)
  throw Error("HTTPS required");
if (!process.env.SOURCE_DATABASE_URL || !process.env.RELAY_TOKEN)
  throw Error("Configure relay credentials");
const pool = new pg.Pool({
  connectionString: process.env.SOURCE_DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000,
  options: "-c default_transaction_read_only=on",
});
try {
  const report = await assess(
    JSON.parse(await readFile(process.argv[2], "utf8")),
    (sql, args) => pool.query(sql, args),
  );
  const response = await fetch(new URL("/api/assessments", endpoint), {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.RELAY_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(report),
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw Error("Assessment submission failed: " + response.status);
  console.log(report.id);
} finally {
  await pool.end();
}
