DO $$
BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'complyos_evidence') THEN
   CREATE ROLE complyos_evidence NOLOGIN NOSUPERUSER NOBYPASSRLS;
 END IF;
 IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'complyos_evidence'
            AND (rolsuper OR rolbypassrls OR rolcanlogin)) THEN
   RAISE EXCEPTION 'complyos_evidence must be a restricted non-login role';
 END IF;
END $$;

GRANT USAGE ON SCHEMA public TO complyos_evidence;
GRANT SELECT, INSERT ON collected_evidence TO complyos_evidence;
ALTER TABLE collected_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE collected_evidence FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS evidence_organization ON collected_evidence;
CREATE POLICY evidence_organization ON collected_evidence TO complyos_evidence
 USING (organization_id = nullif(current_setting('complyos.organization_id', true), ''))
 WITH CHECK (organization_id = nullif(current_setting('complyos.organization_id', true), ''));
