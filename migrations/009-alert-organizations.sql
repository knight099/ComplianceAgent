ALTER TABLE collection_alerts ADD COLUMN IF NOT EXISTS organization_id text NOT NULL
 DEFAULT 'installation' REFERENCES organizations(id);
CREATE UNIQUE INDEX IF NOT EXISTS collection_alert_active_org
 ON collection_alerts(organization_id,source,condition) WHERE resolved_at IS NULL;
DROP INDEX IF EXISTS collection_alert_active;

CREATE TABLE IF NOT EXISTS organization_monitor (
 organization_id text PRIMARY KEY REFERENCES organizations(id),
 last_success timestamptz NOT NULL
);
INSERT INTO organization_monitor SELECT 'installation',last_success FROM collection_monitor
 ON CONFLICT DO NOTHING;

-- Each assessment cited by an episode must belong to its organization and source.
DO $$
DECLARE
 assessment_column text;
 constraint_name text;
BEGIN
 FOREACH assessment_column IN ARRAY ARRAY['opening_assessment','last_assessment','recovery_assessment']
 LOOP
   constraint_name := 'collection_alert_' || assessment_column || '_scope';
   IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='collection_alerts'::regclass AND conname=constraint_name) THEN
     EXECUTE format(
       'ALTER TABLE collection_alerts ADD CONSTRAINT %I FOREIGN KEY (organization_id,source,%I) REFERENCES assessments(organization_id,source,id)',
       constraint_name, assessment_column
     );
   END IF;
 END LOOP;
END $$;
