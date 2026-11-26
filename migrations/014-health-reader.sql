-- The dashboard reads collection health without assuming the worker's write role.
GRANT SELECT (organization_id, kind, revoked_at, source) ON access_identities TO complyos_alert_reader;
GRANT SELECT ON assessments, assessment_results TO complyos_alert_reader;

DROP POLICY IF EXISTS health_assessment_org ON assessments;
CREATE POLICY health_assessment_org ON assessments FOR SELECT TO complyos_alert_reader
 USING (organization_id = nullif(current_setting('complyos.organization_id', true), ''));
DROP POLICY IF EXISTS health_result_org ON assessment_results;
CREATE POLICY health_result_org ON assessment_results FOR SELECT TO complyos_alert_reader
 USING (EXISTS (SELECT FROM assessments a WHERE a.id = assessment_results.assessment_id));
