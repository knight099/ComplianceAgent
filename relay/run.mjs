import pg from "pg";
import { readFile } from "node:fs/promises";
import { assess } from "./offboarding.mjs";
import { openOutbox } from "./outbox.mjs";
const endpoint = new URL(process.env.CONTROL_URL);
if (
  endpoint.protocol !== "https:" &&
  !(
    ["localhost", "127.0.0.1"].includes(endpoint.hostname) &&
    endpoint.protocol === "http:"
  )
)
  throw Error("HTTPS required");
const input = process.argv[2];
if (!input || !process.env.RELAY_TOKEN)
  throw Error("Supply an HR extract path or --flush and configure RELAY_TOKEN");
const queue = openOutbox(
  process.env.RELAY_SPOOL_DIR || ".data/relay",
  endpoint.origin,
);
try {
  if (input !== "--flush") {
    if (!process.env.SOURCE_DATABASE_URL)
      throw Error("Configure SOURCE_DATABASE_URL");
    const pool = new pg.Pool({
      connectionString: process.env.SOURCE_DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
      options: "-c default_transaction_read_only=on",
    });
    try {
      const report = await assess(
        JSON.parse(await readFile(input, "utf8")),
        (sql, args) => pool.query(sql, args),
      );
      queue.enqueue(report);
      console.log("Queued", report.id);
    } finally {
      await pool.end();
    }
  }
  const delivered = await queue.flush(async (body) => {
    const response = await fetch(new URL("/api/assessments", endpoint), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.RELAY_TOKEN,
        "Content-Type": "application/json",
      },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw Error("Assessment submission failed: " + response.status);
    return response.json();
  });
  console.log("Acknowledged", delivered);
} finally {
  queue.close();
}
