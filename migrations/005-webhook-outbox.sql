CREATE TABLE IF NOT EXISTS alert_deliveries (
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 alert_id bigint NOT NULL REFERENCES collection_alerts(id),
 transition text NOT NULL CHECK (transition IN ('opened','resolved')),
 destination text NOT NULL,
 payload jsonb NOT NULL,
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 delivered_at timestamptz,
 UNIQUE(alert_id,transition)
);
CREATE INDEX IF NOT EXISTS pending_alert_deliveries ON alert_deliveries(destination,available_at) WHERE delivered_at IS NULL;

CREATE OR REPLACE FUNCTION queue_collection_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
 target text := current_setting('complyos.webhook_destination',true);
 event_type text;
BEGIN
 IF nullif(target,'') IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN event_type := 'opened';
 ELSIF OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL THEN event_type := 'resolved';
 ELSE RETURN NEW;
 END IF;
 INSERT INTO alert_deliveries(alert_id,transition,destination,payload)
 VALUES(NEW.id,event_type,target,jsonb_build_object(
   'alertId',NEW.id::text,'transition',event_type,'source',NEW.source,'condition',NEW.condition,
   'detail',NEW.detail,'at',coalesce(NEW.resolved_at,NEW.opened_at),
   'assessmentId',CASE WHEN event_type='opened' THEN NEW.opening_assessment ELSE NEW.recovery_assessment END
 ));
 RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER collection_transition AFTER INSERT OR UPDATE OF resolved_at ON collection_alerts
 FOR EACH ROW EXECUTE FUNCTION queue_collection_transition();
