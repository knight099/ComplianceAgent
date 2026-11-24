CREATE TABLE IF NOT EXISTS collection_alerts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 source text NOT NULL,
 condition text NOT NULL CHECK(condition IN ('freshness','database')),
 detail text NOT NULL,
 opened_at timestamptz NOT NULL DEFAULT now(),
 opening_assessment uuid REFERENCES assessments(id),
 last_assessment uuid REFERENCES assessments(id),
 resolved_at timestamptz,
 recovery_assessment uuid REFERENCES assessments(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS collection_alert_active ON collection_alerts(source,condition) WHERE resolved_at IS NULL;
CREATE TABLE IF NOT EXISTS collection_monitor (
 singleton boolean PRIMARY KEY CHECK(singleton),
 last_success timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS collection_alert_checks (
 alert_id bigint NOT NULL REFERENCES collection_alerts(id),
 employee_id text NOT NULL, resource text NOT NULL, role_name text NOT NULL,
 PRIMARY KEY(alert_id,employee_id,resource,role_name)
);
