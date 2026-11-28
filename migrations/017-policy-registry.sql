CREATE TABLE IF NOT EXISTS policy_revisions (
  organization_id text NOT NULL REFERENCES organizations(id),
  source text NOT NULL,
  policy_id text NOT NULL,
  version text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  approved_by text NOT NULL,
  effective_at timestamptz NOT NULL,
  evaluator_version text NOT NULL CHECK (evaluator_version = '1.0.0'),
  definition jsonb NOT NULL,
  PRIMARY KEY (organization_id, source, policy_id, version),
  UNIQUE (organization_id, source, policy_id, effective_at),
  CHECK (effective_at >= approved_at)
);
ALTER TABLE policy_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_revisions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS registry_scope ON policy_revisions;
CREATE POLICY registry_scope ON policy_revisions TO complyos_assessment
 USING (organization_id = nullif(current_setting('complyos.organization_id', true), ''))
 WITH CHECK (organization_id = nullif(current_setting('complyos.organization_id', true), ''));
GRANT SELECT, INSERT ON policy_revisions TO complyos_assessment;
