CREATE TABLE IF NOT EXISTS access_identities (
 kind text NOT NULL CHECK(kind IN ('operator','relay')),
 name text NOT NULL,
 secret_hash text NOT NULL UNIQUE,
 source text,
 created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 PRIMARY KEY(kind,name),
 CHECK ((kind='operator' AND source IS NULL) OR (kind='relay' AND source IS NOT NULL))
);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS submitted_by text;
