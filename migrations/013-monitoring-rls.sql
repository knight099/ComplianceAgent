DO $$
DECLARE role_name text;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['complyos_alert_reader','complyos_delivery'] LOOP
   IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname=role_name) THEN
     EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOBYPASSRLS',role_name);
   END IF;
   IF EXISTS (SELECT FROM pg_roles WHERE rolname=role_name AND (rolsuper OR rolbypassrls OR rolcanlogin)) THEN
     RAISE EXCEPTION '% must be a restricted non-login role',role_name;
   END IF;
 END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO complyos_alert_reader, complyos_delivery;
GRANT SELECT ON collection_alerts, organization_monitor, alert_deliveries TO complyos_alert_reader;
GRANT SELECT (id, organization_id) ON collection_alerts TO complyos_delivery;
GRANT SELECT ON alert_deliveries TO complyos_delivery;
GRANT UPDATE (attempts, last_attempt_at, attempt_result, available_at, delivered_at)
 ON alert_deliveries TO complyos_delivery;

ALTER TABLE collection_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_alerts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alert_org ON collection_alerts;
CREATE POLICY alert_org ON collection_alerts TO complyos_monitor, complyos_alert_reader, complyos_delivery
 USING (organization_id = nullif(current_setting('complyos.organization_id', true),''));

ALTER TABLE organization_monitor ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_monitor FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS heartbeat_org ON organization_monitor;
CREATE POLICY heartbeat_org ON organization_monitor TO complyos_monitor, complyos_alert_reader
 USING (organization_id = nullif(current_setting('complyos.organization_id', true),''));

-- Checks and deliveries inherit ownership from the alert visible to the caller.
ALTER TABLE collection_alert_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_alert_checks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alert_check_org ON collection_alert_checks;
CREATE POLICY alert_check_org ON collection_alert_checks TO complyos_monitor
 USING (EXISTS (SELECT 1 FROM collection_alerts a WHERE a.id=collection_alert_checks.alert_id));

ALTER TABLE alert_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_deliveries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS delivery_org ON alert_deliveries;
CREATE POLICY delivery_org ON alert_deliveries TO complyos_monitor, complyos_alert_reader, complyos_delivery
 USING (EXISTS (SELECT 1 FROM collection_alerts a WHERE a.id=alert_deliveries.alert_id));
