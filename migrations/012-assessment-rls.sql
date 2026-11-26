DO $$
DECLARE role_name text;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['complyos_assessment','complyos_monitor'] LOOP
   IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname=role_name) THEN
     EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOBYPASSRLS',role_name);
   END IF;
   IF EXISTS (SELECT FROM pg_roles WHERE rolname=role_name AND (rolsuper OR rolbypassrls OR rolcanlogin)) THEN
     RAISE EXCEPTION '% must be a restricted non-login role',role_name;
   END IF;
 END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO complyos_assessment, complyos_monitor;
GRANT SELECT, INSERT ON assessments, assessment_results, access_graph_edges TO complyos_assessment;
GRANT SELECT ON access_graph_entities, projected_grant_paths TO complyos_assessment;
ALTER VIEW access_graph_entities SET (security_invoker=true);
ALTER VIEW projected_grant_paths SET (security_invoker=true);

GRANT SELECT ON assessments, assessment_results TO complyos_monitor;
GRANT SELECT (organization_id,kind,revoked_at,source) ON access_identities TO complyos_monitor;
GRANT SELECT (id), UPDATE (id) ON organizations TO complyos_monitor;
GRANT SELECT, INSERT, UPDATE ON collection_alerts, organization_monitor TO complyos_monitor;
GRANT SELECT, INSERT ON collection_alert_checks TO complyos_monitor;
GRANT INSERT ON alert_deliveries TO complyos_monitor;

ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assessment_org ON assessments;
CREATE POLICY assessment_org ON assessments TO complyos_assessment, complyos_monitor
 USING (organization_id = nullif(current_setting('complyos.organization_id',true),''));

ALTER TABLE assessment_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_results FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS result_org ON assessment_results;
CREATE POLICY result_org ON assessment_results TO complyos_assessment, complyos_monitor
 USING (EXISTS (SELECT FROM assessments a WHERE a.id=assessment_results.assessment_id));

ALTER TABLE access_graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_graph_edges FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS graph_org ON access_graph_edges;
CREATE POLICY graph_org ON access_graph_edges TO complyos_assessment
 USING (organization_id = nullif(current_setting('complyos.organization_id',true),''));
