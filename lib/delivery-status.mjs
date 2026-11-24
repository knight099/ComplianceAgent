import { database } from "./store.mjs";

// Delivery eligibility and opening-before-recovery ordering follow the worker query.
export async function deliveryStatus(db = database()) {
  const {
    rows: [summary],
  } = await db.query(`
 WITH pending AS (
   SELECT j.*,EXISTS(SELECT FROM alert_deliveries p WHERE j.transition='resolved'
     AND p.alert_id=j.alert_id AND p.destination=j.destination
     AND p.transition='opened' AND p.delivered_at IS NULL) AS blocked
   FROM alert_deliveries j WHERE j.delivered_at IS NULL
 ), sample AS (
   SELECT * FROM pending ORDER BY available_at,event_id LIMIT 20
 ), receipts AS (
   SELECT * FROM alert_deliveries WHERE delivered_at IS NOT NULL
   ORDER BY delivered_at DESC,event_id LIMIT 20
 )
 SELECT (SELECT count(*)::int FROM pending) AS pending_count,
 coalesce((SELECT jsonb_agg(jsonb_build_object(
   'event_id',event_id,'source',payload->>'source','transition',transition,'attempts',attempts,
   'last_attempt_at',last_attempt_at,'available_at',available_at,'attempt_result',attempt_result,
   'status',CASE WHEN blocked THEN 'Waiting for opening'
     WHEN attempts=0 THEN 'Queued'
     WHEN available_at<=now() THEN 'Eligible for retry'
     WHEN attempt_result IS NULL AND last_attempt_at IS NOT NULL THEN 'Attempt leased'
     ELSE 'Waiting for retry' END
 ) ORDER BY available_at,event_id) FROM sample),'[]') AS pending,
 coalesce((SELECT jsonb_agg(jsonb_build_object(
   'event_id',event_id,'source',payload->>'source','transition',transition,'attempts',attempts,
   'delivered_at',delivered_at,'attempt_result',attempt_result
 ) ORDER BY delivered_at DESC,event_id) FROM receipts),'[]') AS acknowledged`);
  return summary;
}
