ALTER TABLE alert_deliveries
 ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
 ADD COLUMN IF NOT EXISTS attempt_result text;
CREATE INDEX IF NOT EXISTS acknowledged_alert_deliveries
 ON alert_deliveries(delivered_at DESC,event_id) WHERE delivered_at IS NOT NULL;
