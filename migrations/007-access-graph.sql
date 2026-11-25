-- An installation has one organization today. Preserve a namespace for migration.
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS organization_id text NOT NULL DEFAULT 'installation';
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS contract_version text NOT NULL DEFAULT 'complyos.assessment/v1';
CREATE UNIQUE INDEX IF NOT EXISTS assessment_namespace ON assessments(organization_id,source,id);
CREATE TABLE IF NOT EXISTS access_graph_edges (
 organization_id text NOT NULL, source text NOT NULL, assessment_id uuid NOT NULL,
 employee_id text NOT NULL, resource text NOT NULL,
 witness integer NOT NULL, hop integer NOT NULL,
 relation text NOT NULL, from_kind text NOT NULL, from_id text NOT NULL,
 to_kind text NOT NULL, to_id text NOT NULL,
 PRIMARY KEY(assessment_id,employee_id,resource,witness,hop),
 FOREIGN KEY(organization_id,source,assessment_id) REFERENCES assessments(organization_id,source,id),
 FOREIGN KEY(assessment_id,employee_id,resource) REFERENCES assessment_results(assessment_id,employee_id,resource)
);
CREATE INDEX IF NOT EXISTS graph_outgoing ON access_graph_edges(organization_id,source,from_kind,from_id,assessment_id);
CREATE INDEX IF NOT EXISTS graph_incoming ON access_graph_edges(organization_id,source,to_kind,to_id,assessment_id);
CREATE OR REPLACE VIEW access_graph_entities AS
 SELECT organization_id,source,from_kind AS kind,from_id AS external_id FROM access_graph_edges
 UNION SELECT organization_id,source,to_kind,to_id FROM access_graph_edges;

CREATE OR REPLACE FUNCTION project_access_result(r assessment_results) RETURNS void LANGUAGE plpgsql AS $$
DECLARE org text; src text; path jsonb; idx integer:=0; roles text[]; n integer;
BEGIN
 -- Unknown mappings and negative decisions never imply a grant.
 IF r.decision='UNKNOWN' OR r.role_name='' THEN RETURN; END IF;
 SELECT organization_id,source INTO STRICT org,src FROM assessments WHERE id=r.assessment_id;
 INSERT INTO access_graph_edges VALUES(org,src,r.assessment_id,r.employee_id,r.resource,0,0,
   'HAS_ACCOUNT','person',r.employee_id,'role',r.role_name) ON CONFLICT DO NOTHING;
 IF r.decision<>'RETAINED' OR jsonb_typeof(r.evidence->'tableGrantPaths') IS DISTINCT FROM 'array' THEN RETURN; END IF;
 FOR path IN SELECT value FROM jsonb_array_elements(r.evidence->'tableGrantPaths') LOOP
   idx:=idx+1;
   IF jsonb_typeof(path)<>'array' THEN CONTINUE; END IF;
   IF jsonb_array_length(path) NOT BETWEEN 1 AND 9 OR path->>0<>r.role_name OR
     EXISTS(SELECT FROM jsonb_array_elements(path) v WHERE jsonb_typeof(v)<>'string') THEN CONTINUE; END IF;
   SELECT ARRAY(SELECT jsonb_array_elements_text(path)) INTO roles;
   FOR n IN 1..cardinality(roles)-1 LOOP
     INSERT INTO access_graph_edges VALUES(org,src,r.assessment_id,r.employee_id,r.resource,idx,n,
       CASE WHEN roles[n+1]='PUBLIC' AND n=cardinality(roles)-1 THEN 'PUBLIC_GRANTEE' ELSE 'MEMBER_OF' END,
       'role',roles[n],'role',roles[n+1]) ON CONFLICT DO NOTHING;
   END LOOP;
   INSERT INTO access_graph_edges VALUES(org,src,r.assessment_id,r.employee_id,r.resource,idx,cardinality(roles),
     'CAN_READ','role',roles[cardinality(roles)],'relation',r.resource) ON CONFLICT DO NOTHING;
 END LOOP;
END; $$;
CREATE OR REPLACE FUNCTION project_inserted_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM project_access_result(NEW); RETURN NEW; END; $$;
CREATE OR REPLACE TRIGGER project_result AFTER INSERT ON assessment_results
 FOR EACH ROW EXECUTE FUNCTION project_inserted_result();

-- Backfill once, after installing the trigger; migration statements are sent together.
CREATE TABLE IF NOT EXISTS graph_projection_versions (version integer PRIMARY KEY);
DO $$ BEGIN
 INSERT INTO graph_projection_versions VALUES(1) ON CONFLICT DO NOTHING;
 IF FOUND THEN
   PERFORM project_access_result(r) FROM assessment_results r
   WHERE decision<>'UNKNOWN' AND role_name<>'';
 END IF;
END; $$;
CREATE OR REPLACE VIEW projected_grant_paths AS
 SELECT assessment_id,employee_id,resource,jsonb_agg(roles ORDER BY witness) AS paths
 FROM (SELECT assessment_id,employee_id,resource,witness,jsonb_agg(from_id ORDER BY hop) AS roles
 FROM access_graph_edges WHERE witness>0 GROUP BY assessment_id,employee_id,resource,witness) chains
 GROUP BY assessment_id,employee_id,resource;
