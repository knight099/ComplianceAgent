CREATE TABLE IF NOT EXISTS access_reviews (
  organization_id text NOT NULL REFERENCES organizations(id),
  id text NOT NULL,
  source text NOT NULL,
  observed_at timestamptz NOT NULL,
  submitted_by text NOT NULL,
  report jsonb NOT NULL,
  PRIMARY KEY (organization_id, id)
);
CREATE INDEX IF NOT EXISTS access_reviews_history ON access_reviews (organization_id, observed_at DESC, id);
ALTER TABLE access_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_reviews FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS access_review_scope ON access_reviews;
CREATE POLICY access_review_scope ON access_reviews TO complyos_assessment
 USING (organization_id = nullif(current_setting('complyos.organization_id', true), ''))
 WITH CHECK (organization_id = nullif(current_setting('complyos.organization_id', true), ''));
GRANT SELECT, INSERT ON access_reviews TO complyos_assessment;
