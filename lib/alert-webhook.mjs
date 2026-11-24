import { createHash, createHmac } from "node:crypto";

export function webhookConfig(url, secret) {
  if (!url) return null;
  const target = new URL(url);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(target.hostname);
  if (
    target.username ||
    target.password ||
    target.hash ||
    !(target.protocol === "https:" || (local && target.protocol === "http:"))
  )
    throw Error("Invalid webhook URL");
  if (!secret || secret.length < 32)
    throw Error("Configure a webhook signing secret of at least 32 characters");
  return {
    url: target.href,
    secret,
    destination: createHash("sha256").update(target.href).digest("hex"),
  };
}

export async function deliverNext(db, config, send = fetch) {
  // The claim commits before HTTP. Attempts fence late completions after lease expiry.
  const {
    rows: [job],
  } = await db.query(
    `WITH next AS (
 SELECT j.event_id FROM alert_deliveries j WHERE j.destination=$1 AND j.delivered_at IS NULL AND j.available_at<=now()
 AND NOT EXISTS(SELECT FROM alert_deliveries prior WHERE prior.destination=j.destination AND prior.alert_id=j.alert_id
   AND prior.transition='opened' AND j.transition='resolved' AND prior.delivered_at IS NULL)
 ORDER BY j.available_at,j.event_id LIMIT 1 FOR UPDATE SKIP LOCKED)
 UPDATE alert_deliveries d SET attempts=attempts+1,available_at=now()+interval '60 seconds'
 FROM next WHERE d.event_id=next.event_id RETURNING d.event_id,d.payload,d.attempts`,
    [config.destination],
  );
  if (!job) return false;
  const body = JSON.stringify({ eventId: job.event_id, ...job.payload });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", config.secret)
    .update(timestamp + "." + body)
    .digest("hex");
  let delivered = false;
  try {
    const res = await send(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ComplyOS-Timestamp": timestamp,
        "X-ComplyOS-Signature": "sha256=" + signature,
      },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    delivered = res.ok;
    await res.body?.cancel();
  } catch {
    /* The outbox retains the event for retry. */
  }
  await db.query(
    `UPDATE alert_deliveries SET delivered_at=CASE WHEN $3::boolean THEN now() ELSE NULL END,
 available_at=now()+($4::integer*interval '1 second') WHERE event_id=$1 AND attempts=$2 AND delivered_at IS NULL`,
    [
      job.event_id,
      job.attempts,
      delivered,
      Math.min(3600, 60 * 2 ** Math.min(job.attempts - 1, 6)),
    ],
  );
  if (!delivered) console.warn("Webhook delivery deferred", job.event_id);
  return true;
}
