import { setTimeout as delay } from "node:timers/promises";
import { sweep } from "../lib/collection-alerts.mjs";
import { database } from "../lib/store.mjs";
import { webhookConfig, deliverNext } from "../lib/alert-webhook.mjs";
const organization = process.env.COMPLYOS_MONITOR_ORGANIZATION ?? "installation";
const config = webhookConfig(
  process.env.ALERT_WEBHOOK_URL,
  process.env.ALERT_WEBHOOK_SECRET,
  organization,
);
const once = process.argv.includes("--once");
try {
  do {
    try {
      await sweep(config?.destination, organization);
      if (config)
        for (let i = 0; i < 10; i++) {
          if (!(await deliverNext(config))) break;
        }
    } catch (e) {
      if (once) throw e;
      console.error("Collection monitor sweep failed:", e.code || e.name);
    }
    if (!once) await delay(60000);
  } while (!once);
} finally {
  await database().end();
}
