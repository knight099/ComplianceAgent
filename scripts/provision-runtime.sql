-- Run inside the migration job's transaction. These role names are cluster-wide.
DO $$
DECLARE
 login_name text;
 marker constant text := 'ComplyOS runtime login for database ' || current_database();
BEGIN
 FOREACH login_name IN ARRAY ARRAY['complyos_app', 'complyos_worker'] LOOP
   IF EXISTS (SELECT FROM pg_roles WHERE rolname=login_name) THEN
     IF NOT EXISTS (
       SELECT FROM pg_roles WHERE rolname=login_name AND rolcanlogin
       AND NOT (rolsuper OR rolinherit OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls)
       AND shobj_description(oid,'pg_authid')=marker
     ) THEN
       RAISE EXCEPTION 'Existing role % is not the configured ComplyOS runtime login', login_name;
     END IF;
   ELSE
     EXECUTE format('CREATE ROLE %I LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', login_name);
     EXECUTE format('COMMENT ON ROLE %I IS %L', login_name, marker);
   END IF;
   EXECUTE format('ALTER ROLE %I PASSWORD %L', login_name, current_setting('complyos.' || login_name || '_password'));
   EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), login_name);
 END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO complyos_app;
GRANT SELECT (kind, name, source, secret_hash, ai_enabled, revoked_at, organization_id)
 ON access_identities TO complyos_app;
GRANT complyos_evidence, complyos_assessment, complyos_alert_reader TO complyos_app WITH INHERIT FALSE;
GRANT complyos_monitor, complyos_delivery TO complyos_worker WITH INHERIT FALSE;
