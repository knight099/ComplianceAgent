CREATE TABLE IF NOT EXISTS assessments (
 id uuid PRIMARY KEY,
 source text NOT NULL,
 collected_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 policy_version text NOT NULL
);
CREATE TABLE IF NOT EXISTS assessment_results (
 assessment_id uuid NOT NULL REFERENCES assessments(id),
 employee_id text NOT NULL,
 role_name text NOT NULL,
 resource text NOT NULL,
 decision text NOT NULL CHECK (decision IN ('RETAINED','UNKNOWN','NO_SCOPED_GRANT')),
 evidence jsonb NOT NULL,
 PRIMARY KEY(assessment_id,employee_id,resource)
);
CREATE INDEX IF NOT EXISTS assessment_by_source ON assessments(source,collected_at DESC);
CREATE TABLE IF NOT EXISTS collected_evidence (
 id text PRIMARY KEY, observation jsonb NOT NULL, received_at timestamptz NOT NULL DEFAULT now()
);
