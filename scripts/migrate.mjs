import { readFileSync } from "node:fs";
import { migrate, database } from "../lib/store.mjs";

try {
  const provision = process.argv.includes("--provision-runtime");
  const appPassword = process.env.APP_DB_PASSWORD;
  const workerPassword = process.env.WORKER_DB_PASSWORD;
  if (provision && (!appPassword || !workerPassword || appPassword === workerPassword))
    throw Error("Set separate APP_DB_PASSWORD and WORKER_DB_PASSWORD credentials");
  await migrate();
  if (provision) {
    const client = await database().connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL password_encryption = 'scram-sha-256'");
      await client.query(
        "SELECT set_config('complyos.complyos_app_password',$1,true), set_config('complyos.complyos_worker_password',$2,true)",
        [appPassword, workerPassword],
      );
      await client.query(readFileSync(new URL("./provision-runtime.sql", import.meta.url), "utf8"));
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      // PL/pgSQL error context can include an expanded password-setting command.
      throw Error("Database runtime login provisioning failed: " + (error.code || "connection error"));
    } finally {
      client.release();
    }
  }
} finally {
  await database().end();
}
