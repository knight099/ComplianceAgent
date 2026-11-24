import { collectionHealth } from "./collection-health.mjs";
import { database } from "./store.mjs";

// Caller holds a transaction. Serialize sweeps before collecting their evidence.
export async function evaluateAlerts(client) {
  await client.query(
    "LOCK TABLE collection_monitor IN SHARE ROW EXCLUSIVE MODE",
  );
  const sources = await collectionHealth(client);
  for (const row of sources) {
    const { source, assessment_id: id } = row;
    for (const condition of ["freshness", "database"]) {
      const freshness = condition === "freshness";
      const triggered = freshness
        ? row.freshness !== "Current"
        : row.failed > 0;
      if (triggered) {
        const detail = freshness
          ? row.freshness
          : row.failed + " database checks failed";
        const {
          rows: [alert],
        } = await client.query(
          `INSERT INTO collection_alerts(source,condition,detail,opening_assessment,last_assessment)
      VALUES($1,$2,$3,$4,$4) ON CONFLICT(source,condition) WHERE resolved_at IS NULL
      DO UPDATE SET detail=excluded.detail,last_assessment=excluded.last_assessment RETURNING id`,
          [source, condition, detail, id],
        );
        if (!freshness)
          await client.query(
            `INSERT INTO collection_alert_checks
      SELECT $1,employee_id,resource,role_name FROM assessment_results
      WHERE assessment_id=$2 AND decision='UNKNOWN' AND evidence->>'reason'='PostgreSQL collection failed'
      ON CONFLICT DO NOTHING`,
            [alert.id, id],
          );
      } else if (
        row.freshness === "Current" &&
        (freshness || (row.evaluated > 0 && row.unknown === 0))
      ) {
        // A clock catching up or a narrower collection alone cannot prove recovery.
        await client.query(
          `UPDATE collection_alerts a SET resolved_at=now(),recovery_assessment=$3
      WHERE source=$1 AND condition=$2 AND resolved_at IS NULL AND last_assessment IS DISTINCT FROM $3::uuid
      AND ($2='freshness' OR NOT EXISTS (
        SELECT 1 FROM collection_alert_checks old WHERE old.alert_id=a.id
        AND NOT EXISTS (SELECT 1 FROM assessment_results fresh WHERE fresh.assessment_id=$3
          AND fresh.employee_id=old.employee_id AND fresh.resource=old.resource AND fresh.role_name=old.role_name
          AND fresh.decision<>'UNKNOWN')
      ))`,
          [source, condition, id],
        );
      }
    }
  }
  await client.query(
    "INSERT INTO collection_monitor VALUES(true,clock_timestamp()) ON CONFLICT(singleton) DO UPDATE SET last_success=excluded.last_success",
  );
}
export async function sweep(destination = null) {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    if (destination)
      await client.query(
        "SELECT set_config('complyos.webhook_destination',$1,true)",
        [destination],
      );
    await evaluateAlerts(client);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export async function alerts(db = database()) {
  const {
    rows: [row],
  } =
    await db.query(`SELECT (SELECT last_success FROM collection_monitor WHERE singleton) AS checked_at,
   coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.opened_at DESC,a.id DESC) FROM collection_alerts a WHERE resolved_at IS NULL),'[]') AS open,
   coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.resolved_at DESC,r.id DESC) FROM
   (SELECT * FROM collection_alerts WHERE resolved_at IS NOT NULL ORDER BY resolved_at DESC,id DESC LIMIT 20) r),'[]') AS recent`);
  return row;
}
