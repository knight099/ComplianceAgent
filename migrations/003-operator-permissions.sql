-- Preserve existing operator access when upgrading. Relay authentication is separate.
ALTER TABLE access_identities ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT true;
