import { setTimeout as delay } from "node:timers/promises";
import { sweep } from "../lib/collection-alerts.mjs";
import { database } from "../lib/store.mjs";
const once = process.argv.includes("--once");
try {
  do {
    try {
      await sweep();
    } catch (e) {
      if (once) throw e;
      console.error("Collection monitor sweep failed:", e.code || e.name);
    }
    if (!once) await delay(60000);
  } while (!once);
} finally {
  await database().end();
}
