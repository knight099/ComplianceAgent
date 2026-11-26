CREATE TABLE IF NOT EXISTS organizations (
 id text PRIMARY KEY CHECK (length(trim(id)) > 0)
);
INSERT INTO organizations(id) VALUES ('installation') ON CONFLICT DO NOTHING;
INSERT INTO organizations(id) SELECT DISTINCT organization_id FROM assessments ON CONFLICT DO NOTHING;
ALTER TABLE access_identities ADD COLUMN IF NOT EXISTS organization_id text NOT NULL
 DEFAULT 'installation' REFERENCES organizations(id);
DO $$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_constraint
   WHERE conrelid='assessments'::regclass AND conname='assessments_organization_fk'
 ) THEN
   ALTER TABLE assessments ADD CONSTRAINT assessments_organization_fk
     FOREIGN KEY (organization_id) REFERENCES organizations(id);
 END IF;
END $$;
