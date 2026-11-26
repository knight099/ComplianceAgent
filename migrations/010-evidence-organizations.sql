ALTER TABLE collected_evidence ADD COLUMN IF NOT EXISTS organization_id text NOT NULL
 DEFAULT 'installation' REFERENCES organizations(id);

DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='collected_evidence'::regclass
                AND conname='collected_evidence_org_pk') THEN
   ALTER TABLE collected_evidence DROP CONSTRAINT collected_evidence_pkey,
     ADD CONSTRAINT collected_evidence_org_pk PRIMARY KEY (organization_id,id);
 END IF;
END $$;
