# Read-only offboarding pilot

IT and a data owner select one authorized PostgreSQL database, scoped tables and a current HR extract. Follow the README to enroll a source-bound relay, run collection, and open its assessment. Keep HR files, credentials and exported evidence in approved customer storage.

Before reviewing results, have the owner record the privileges they independently expect to find. Use employee IDs and schema/table pairs. An expected retained grant means the owner believes a grant exists; agreement here establishes observation accuracy, not policy approval.

```json
{"source":"payments-primary","checks":[{"employeeId":"employee-105","resource":["customer","identity_records"],"expected":"NO_SCOPED_GRANT"}]}
```

In the source's assessment, open **Reconcile with data-owner baseline**, select the JSON file, and download the report. It includes the assessment ID, collection time, matches, discrepancies, missing evidence, checks absent from the baseline, unique unresolved employees and failed database check count. Investigate each discrepancy with the data owner. Unknown or stale observations cannot verify a baseline check.

For a change made by an authorized administrator, record its timestamp in the relevant check's optional `revokedAt` field using ISO 8601 with timezone. Run the read-only relay again. A subsequent fresh observation of no scoped grant reports the elapsed seconds from the recorded change to collection. This is an observation delay, not the time the grant stopped being effective. Preserve both reports. Record the pilot's database scope, mapping gaps and remaining access paths outside PostgreSQL before interpreting results.


When a PostgreSQL check finds retained access, expand the employee result to see table-level SELECT grant paths. Each chain starts with the mapped role and ends at the relation. Review parallel chains individually and collect again after a change. The relay samples up to 513 traversal states, follows up to eight membership edges, and displays up to 32 paths. A limit indicator marks potentially incomplete explanations. Column-level grants, superuser privileges, and implicit system privileges can produce a retained decision without a displayed table grant path. Older observations remain readable with their original evidence.

## Compare collection history

Open **Compare assessments** on the source, choose an earlier and later collection, and select **Compare**. Expand a result to inspect both evidence records and their assessment references. The comparison joins on employee ID and resource and verifies that the mapped role and policy version are consistent. A missing check, unknown decision, changed mapping or policy, or later snapshot outside the 24-hour freshness window yields **Unverified**. An earlier snapshot may be historical. The displayed review time and collection timestamps establish when a conclusion applied.

**Access retained** can include removed paths when another grant survives. **Verified no scoped grant** requires an earlier retained decision followed by a fresh negative PostgreSQL check. Deltas for individual table grant paths require complete path evidence in both snapshots. Column privileges and other access mechanisms retain the scope described above.

## Monitor collection health

The dashboard lists previously observed sources and sources assigned to active named relay credentials. **Awaiting first collection** means an enrolled source has never submitted an assessment. Shared-credential installations can list a source only after its first report. A collection becomes **Overdue** after 24 hours. A future timestamp requires a relay clock check. Refresh the dashboard to recalculate these states.

For each source, compare observation time with receipt time to spot delayed delivery. The latest observation supplies the counts even if an older buffered report arrives later. Unknown includes incomplete evidence and identity mapping issues; database failures count checks where the relay recorded a PostgreSQL collection error. Zero evaluated checks can occur when the submitted HR scope has no terminated employees. These metrics describe evidence delivery and coverage; they do not measure legal compliance or endpoint uptime.

### Automated collection alerts

Compose starts a monitor that checks collection health every minute and persists alerts in PostgreSQL. For a host deployment, run `node scripts/migrate.mjs` and then supervise `node scripts/collection-monitor.mjs` with the control-plane database connection. Use `--once` for a single scheduled sweep.

The dashboard shows open alerts, the last successful sweep and the latest 20 recoveries. A monitor timestamp older than three minutes flags delayed monitoring. A source gets at most one open freshness alert and one open database-failure alert. A later current assessment clears a freshness alert. Database-failure recovery also requires a fresh assessment with known decisions covering every failed employee, role and resource recorded during the incident. Missing scope, empty reports and unresolved mappings keep the alert open. A retained grant can confirm collection recovery; the separate access review still shows the grant. A source removed from enrollment without new evidence has no verified recovery. Dashboard alerts are available by default; external delivery is opt-in.

Each sweep evaluates the latest observation per source. A transient failure followed by recovery between sweeps may appear only in assessment history.

### Deliver transitions to an approved webhook

Set `ALERT_WEBHOOK_URL` and `ALERT_WEBHOOK_SECRET` on the collection monitor and recreate its container. Use an HTTPS endpoint and a random signing secret (at least 32 characters). For local integration tests the worker accepts HTTP on loopback. The monitor sends newly observed alert openings and recoveries while configured. It leaves existing dashboard history intact.

The JSON body contains a stable event ID, alert ID, transition, source, condition, detail, transition time and assessment reference. Verify the hex HMAC-SHA256 signature in `X-ComplyOS-Signature` (prefix `sha256=`) over the Unix-seconds `X-ComplyOS-Timestamp`, a literal period and the exact raw request body. Compare signatures in constant time, reject timestamps outside the receiver’s tolerance, and deduplicate by event ID before returning HTTP 2xx. The signing timestamp is renewed on retry.

Enqueueing is atomic with the alert transition. Delivery is at least once. Network errors and non-2xx responses retry with a delay increasing from one minute to one hour. For each destination and alert, its opening must be acknowledged before its queued recovery can be delivered. Disabling the URL pauses pending work; changing it leaves pending events bound to the old destination. Restore the original URL to resume that queue. To inspect the backlog, query `alert_deliveries` for rows with a null `delivered_at`. Configure receiver access and retention for source names and assessment references.

In **Collection alerts → Webhook deliveries**, review the total pending count, up to 20 pending events, and the latest 20 acknowledgments. Use the event ID to correlate receiver logs with a retry. An HTTP status indicates a response from the receiver; a transport error can indicate a timeout, network issue, or rejected redirect. A leased attempt has been claimed and its completion is unconfirmed. Eligibility time is the earliest permitted retry, and delivery also requires an active worker configured for that destination. Older events may have no recorded HTTP result. The dashboard exposes delivery metadata without receiver URLs, secrets, or message bodies.
