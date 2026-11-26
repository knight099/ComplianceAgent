import { organizationTransaction } from "./store.mjs";

// Compare observation times, since a relay may deliver buffered reports out of order.
export async function collectionHealth(db, organization = "installation") {
  if (!db) return organizationTransaction("alertReader", organization, client => collectionHealth(client, organization));
  const { rows } = await db.query(`
 WITH newest AS (
   SELECT DISTINCT ON(source) source,id,collected_at,received_at
   FROM assessments WHERE organization_id=$1 ORDER BY source,collected_at DESC,received_at DESC,id DESC
 ), enrolled AS (
   SELECT source,count(*)::int AS relays FROM access_identities
   WHERE organization_id=$1 AND kind='relay' AND revoked_at IS NULL GROUP BY source
 ), checks AS (
   SELECT n.id,count(r.employee_id)::int AS evaluated,
     count(*) FILTER(WHERE r.decision='UNKNOWN')::int AS unknown,
     count(*) FILTER(WHERE r.decision='UNKNOWN' AND r.evidence->>'reason'='PostgreSQL collection failed')::int AS failed
   FROM newest n LEFT JOIN assessment_results r ON r.assessment_id=n.id GROUP BY n.id
 )
 SELECT coalesce(n.source,e.source) AS source,coalesce(e.relays,0) AS enrolled_relays,
   n.id AS assessment_id,n.collected_at,n.received_at,c.evaluated,c.unknown,c.failed,
   CASE WHEN n.id IS NULL THEN 'Awaiting first collection'
        WHEN n.collected_at>now() THEN 'Future timestamp'
        WHEN n.collected_at<now()-interval '24 hours' THEN 'Overdue'
        ELSE 'Current' END AS freshness
 FROM newest n FULL JOIN enrolled e ON e.source=n.source
 LEFT JOIN checks c ON c.id=n.id ORDER BY source`, [organization]);
  return rows;
}
