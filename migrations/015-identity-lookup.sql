-- Authentication precedes tenant selection. Return one active principal only
-- when its credential, credential kind and (for operators) username match.
CREATE OR REPLACE FUNCTION public.authenticate_identity(
 credential_kind text, credential_hash text, operator_name text
) RETURNS TABLE(name text, source text, ai_enabled boolean, organization_id text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
 SELECT i.name, i.source, i.ai_enabled, i.organization_id
 FROM public.access_identities AS i
 WHERE i.secret_hash = credential_hash AND i.kind = credential_kind
   AND i.revoked_at IS NULL
   AND ((credential_kind = 'operator' AND i.name = operator_name)
        OR (credential_kind = 'relay' AND operator_name IS NULL))
$$;
REVOKE ALL ON FUNCTION public.authenticate_identity(text,text,text) FROM PUBLIC;

-- Non-owner readers with column grants may inspect active relay inventory
-- only in the organization established by the current transaction.
ALTER TABLE public.access_identities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS enrolled_relay_inventory ON public.access_identities;
CREATE POLICY enrolled_relay_inventory ON public.access_identities FOR SELECT
 TO complyos_monitor, complyos_alert_reader
 USING (kind='relay' AND revoked_at IS NULL AND
        organization_id=nullif(current_setting('complyos.organization_id',true),''));

-- Upgrade an already provisioned application even on schema-only migrations.
DO $$
BEGIN
 IF EXISTS (SELECT FROM pg_roles WHERE rolname='complyos_app'
            AND shobj_description(oid,'pg_authid')='ComplyOS runtime login for database ' || current_database()) THEN
   REVOKE SELECT (kind,name,source,secret_hash,ai_enabled,revoked_at,organization_id)
     ON public.access_identities FROM complyos_app;
   GRANT EXECUTE ON FUNCTION public.authenticate_identity(text,text,text) TO complyos_app;
 END IF;
END $$;
