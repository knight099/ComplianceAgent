# Read-only offboarding pilot

IT and a data owner select one authorized PostgreSQL database, scoped tables and a current HR extract. Follow the README to enroll a source-bound relay, run collection, and open its assessment. Keep HR files, credentials and exported evidence in approved customer storage.

Before reviewing results, have the owner record the privileges they independently expect to find. Use employee IDs and schema/table pairs. An expected retained grant means the owner believes a grant exists; agreement here establishes observation accuracy, not policy approval.

```json
{"source":"payments-primary","checks":[{"employeeId":"employee-105","resource":["customer","identity_records"],"expected":"NO_SCOPED_GRANT"}]}
```

In the source's assessment, open **Reconcile with data-owner baseline**, select the JSON file, and download the report. It includes the assessment ID, collection time, matches, discrepancies, missing evidence, checks absent from the baseline, unique unresolved employees and failed database check count. Investigate each discrepancy with the data owner. Unknown or stale observations cannot verify a baseline check.

For a change made by an authorized administrator, record its timestamp in the relevant check's optional `revokedAt` field using ISO 8601 with timezone. Run the read-only relay again. A subsequent fresh observation of no scoped grant reports the elapsed seconds from the recorded change to collection. This is an observation delay, not the time the grant stopped being effective. Preserve both reports. Record the pilot's database scope, mapping gaps and remaining access paths outside PostgreSQL before interpreting results.


When a PostgreSQL check finds retained access, expand the employee result to see table-level SELECT grant paths. Each chain starts with the mapped role and ends at the relation. Review parallel chains individually and collect again after a change. The relay samples up to 513 traversal states, follows up to eight membership edges, and displays up to 32 paths. A limit indicator marks potentially incomplete explanations. Column-level grants, superuser privileges, and implicit system privileges can produce a retained decision without a displayed table grant path. Older observations remain readable with their original evidence.
