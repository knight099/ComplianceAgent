# ComplyOS operator guide

Run commands from the repository root. For the Docker quick start, see the [README](../README.md#start-locally).

## Run without Docker

Use Node.js 24 and PostgreSQL 16 or newer. In an administrative shell, set `DATABASE_URL` to the schema owner's connection string. The owner needs permission to create roles and grant membership. Set `APP_DB_PASSWORD` and `WORKER_DB_PASSWORD` to distinct secrets and run:

```sh
npm ci
node scripts/migrate.mjs --provision-runtime
```

Start the services in separate environments. Give each process its own `DATABASE_URL`, pointing to the same database. Supply administrative credentials only to the migration and identity administration commands.

| Process | Database username | Other settings | Command |
|---|---|---|---|
| Application | `complyos_app` | Set `OPERATOR_PASSWORD` and `RELAY_TOKEN` for shared authentication. | `npm run build && npm start` |
| Collection monitor | `complyos_worker` | Set `COMPLYOS_MONITOR_ORGANIZATION` when monitoring a named organization. | `node scripts/collection-monitor.mjs` |

Open [Operations](http://localhost:3000/operations). If your DBA manages logins independently, `node scripts/migrate.mjs` still applies only the schema. The [runtime grants](../scripts/provision-runtime.sql) list the permissions each login needs.

## Run a read-only collection

On a host that can reach the database being checked, install Node.js 24 and open the repository directory. Use a read-only account on the source PostgreSQL database (version 16 or newer). For a relay on the same machine as the control plane, use these settings. Set `RELAY_TOKEN` in this shell to the value you gave Compose, or use the named relay credential if you enabled named authentication. Replace the source connection string with your own. Remote relays require an HTTPS control-plane URL.

```sh
npm ci
export CONTROL_URL=http://127.0.0.1:3000
export SOURCE_DATABASE_URL='postgresql://readonly_user:password@db.example.org:5432/payments'
export RELAY_TOKEN='replace_with_your_relay_upload_token'
```

Save an HR extract and reviewed identity mappings in this JSON shape:

```json
{
  "source": "payments-primary",
  "hrRevision": "hr-export-2026-11-24-01",
  "hrObserved": "2026-11-24T09:00:00Z",
  "resources": [["customer", "identity_records"]],
  "employees": [{"id":"employee-105","status":"terminated","role":"analyst_105"}]
}
```

Run `node relay/run.mjs /secure/path/hr-scope.json`. A successful upload prints `Acknowledged` and a count. Refresh Operations to see the source and collection time. Replace all sample identifiers and use the actual extract timestamp. Include active employees in the mapping so shared-role ambiguity is visible. Use a unique source name per database and scope. Keep the HR extract, connection strings and shared secrets outside version control.

### Collect from HR CSV and Entra ID

Run `node relay/run.mjs /secure/employees.csv /secure/scope.json`. The CSV contains one row per employee, including active employees. Map the headers in the scope file and supply the revision and observation time of that specific export.

```csv
Worker ID,Employment status,Database role
00105,terminated,analyst_105
00106,active,
```

```json
{
  "source": "payments-primary",
  "hrRevision": "export-42",
  "hrObserved": "2026-11-24T09:00:00Z",
  "resources": [["customer", "identity_records"]],
  "columns": {"id": "Worker ID", "status": "Employment status", "role": "Database role"}
}
```

IDs and role names retain their original spelling and leading zeros. Status values are `active` and `terminated`. A blank role represents a missing mapping. Shared roles produce unknown findings for affected terminated employees.

Append `--entra` to either the JSON or CSV collection command to require directory corroboration. Supply a current Microsoft Graph access token for the source tenant through `ENTRA_ACCESS_TOKEN` with read access to directory users and their `employeeId` property (for example, application permission `User.Read.All` with administrator consent). The relay pages through public-cloud Microsoft Graph users and matches HR IDs exactly against `employeeId`. Only matching account IDs and match evidence for assessed employees enter the report. Duplicate matches, missing matches and incomplete directory reads yield `UNKNOWN`. The database role still comes from the reviewed HR mapping. The caller handles token acquisition and renewal.

### Review access against a company SOP

Set `SOURCE_DATABASE_URL` to the read-only database connection. Supply the current `businessRole` separately from the PostgreSQL `role` for each active employee in the HR JSON. For CSV, set `columns.businessRole` in the scope file to the corresponding HR column. A transfer is represented by the employee's new business role.

Supply an owner-reviewed policy file. This example classifies one table and records explicit read expectations for two roles. The source must match the HR scope.

```json
{
  "id": "KYC-ACCESS",
  "version": "3",
  "source": "payments-primary",
  "reference": "Access SOP section 4",
  "reviewer": "Lending data owner",
  "datasets": [{
    "resource": ["customer", "identity_records"],
    "classification": "restricted-personal-data",
    "roles": {"Lending": "read", "Marketing": "none"}
  }],
  "exceptions": []
}
```

```sh
umask 077
node relay/access-report.mjs policy.json /secure/hr-scope.json > /secure/review.json
# CSV alternative, with directory corroboration
node relay/access-report.mjs policy.json /secure/employees.csv /secure/scope.json --entra > /secure/directory-review.json
```

Open **Reports** in the overview and select the generated file. The report contains employee IDs, role names and grant paths. It is a local point-in-time artifact. Each row compares scoped PostgreSQL SELECT privileges with the reviewed role expectation. Unknown roles or datasets yield insufficient evidence. Terminated employees are expected to have no read grant on covered datasets. An active exception may permit a read grant for a named employee and business role on a specific resource. Each exception records `employeeId`, `businessRole`, `resource`, `approver`, `reference`, and ISO timestamps `from` (inclusive) and `until` (exclusive).

Collection uses one read-only PostgreSQL catalog snapshot and the existing 24-hour HR freshness window. The report includes bounded table-grant paths when available. A column-level grant can yield a positive read result without a table-grant path. These observations describe catalog privileges. Row-level restrictions, actual reads and regulatory conclusions require additional evidence.

### Recover interrupted uploads

Each collection commits its assessment to an encrypted local SQLite queue before uploading. If the service is unavailable or returns an invalid receipt, the relay exits with an error and retains the assessment. The next collection retries pending reports for the same control-plane origin. To retry independently of collection, run `node relay/run.mjs --flush` with the original control URL, relay token and spool directory. Schedule this command with the host service manager for unattended retries.

Set `RELAY_SPOOL_DIR` to persistent storage accessible only to the relay service account. Its default is `.data/relay` relative to the working directory. Preserve both the database and the adjacent 0600 encryption key across restarts. A local administrator with both can decrypt queued data. Reports retain their original IDs and collection times across delivery attempts; the control plane deduplicates repeated submissions by ID.

## Reading an assessment

* **RETAINED** indicates a PostgreSQL role with SELECT privilege on at least one column, directly, through inheritance or through an available SET ROLE. Evidence identifies the mapped employee, accessible roles, applicable table ACL grantees, resource, HR revision, policy and collection time.
* **NO_SCOPED_GRANT** indicates a negative privilege check on the specified table. The result covers database privileges. Actual login, network access, row-level policies, delegated functions, views and application access require separate evidence.
* **UNKNOWN** identifies missing or ambiguous mappings, a missing relation or role, stale HR evidence or a collection failure. The dashboard flags assessments older than 24 hours.

The relay queries PostgreSQL catalogs and does not read table contents or modify privileges. This implementation is for one organization per deployment. Separate databases, ingestion credentials and operator credentials are required for independent organizations. OIDC, per-relay PKI and approved remediation are future work.

## Verification

Run `npm test` for signed-bundle checks and a PostgreSQL-backed role membership, revocation and migration test. Run `npm run build` for the application build.

## Connect your own model

Select **AI Copilot** in the overview to open **AI model connection**. Select a provider, choose a server-approved model ID available to your account, provide the API key when the provider requires one, and select **Test connection**. Select an assessment and **Generate summary** to explain its counts and freshness. Each browser session supplies its own credentials. Reloading or clearing the connection releases the key from application state. Use HTTPS when operating remotely and keep request bodies and authorization headers out of proxy logs.

OpenAI is available by default. To offer a private gateway, Ollama, vLLM or another OpenAI-compatible service, set the following on the **app server** and restart it (recreate the app container for Compose):

```sh
export AI_MODELS='{"OpenAI":["gpt-4o-mini"],"Internal model":["internal-small"]}'
export AI_ENDPOINTS='{"OpenAI":"https://api.openai.com/v1/chat/completions","Internal model":"https://models.example.org/v1/chat/completions"}'
```

Replace the example URL with the full chat-completions endpoint. The provider must accept a model and messages and return text in `choices[0].message.content`. The server uses bearer authentication when a key is supplied. Private keyless models can leave the key blank. Loopback HTTP is supported for local inference; inside a container loopback refers to that container. Endpoints using other protocols or authentication schemes need a compatible gateway. Test calls may incur provider charges.

The default model selection is OpenAI's `gpt-4o-mini`. For an existing deployment with other models or custom endpoints, add their exact IDs to `AI_MODELS` before upgrading. Replace the example model names with IDs offered by your provider. An empty model map (`{}`) disables inference. When using Compose, set these values in the deployment environment or its private `.env` file and recreate the app container.

To restrict destinations by organization, set `AI_TENANT_PROVIDERS` to a JSON object such as `{"installation":["Internal model"],"finance":[]}`. When this setting is present, an omitted organization or an empty provider list disables model calls for that organization. Without it, analysts can use the installation's approved connections.

Both operations use the same outbound privacy policy (`complyos.model-privacy/v1`). The connection probe sends a fixed message. A summary sends a freshness flag and three count ranges (0–4, 5–9, 10–49 or 50+). Exact counts, timestamps, employee identifiers, access reports and source names stay in ComplyOS. Unexpected summary fields or invalid types block transmission. The application logs the policy version and allow/block decision. This applies to hosted and private endpoints. Review proxy and provider logging independently.

## Individual operator and relay credentials

For a dedicated organization, set `AUTH_MODE=named` on the app and run the migrations. Recreate the Compose app after changing modes. Named mode authenticates each request against PostgreSQL and disables the shared credentials. Existing deployments default to `shared` for compatibility.

Run these commands on the control-plane host with administrative database access (or prefix each with `docker compose run --rm migrate`):

```sh
node scripts/identity.mjs issue operator alice
node scripts/identity.mjs issue relay payments-relay payments-primary
```

Each issue command prints a generated secret once. Deliver it through your secret manager. An operator signs in with the issued name and secret. To remove that operator’s access, run `node scripts/identity.mjs revoke operator alice`. A relay uses its secret as `RELAY_TOKEN` and submits only the source named at issuance. To revoke it, run `node scripts/identity.mjs revoke relay payments-relay`. Revocation applies to subsequent requests. For rotation, issue a distinct name, deploy its credential, verify access, then revoke the previous name. Prior assessments retain their original submitter attribution; assessments predating this feature show “Unrecorded”.

### Organization membership

After running database migrations, existing credentials and shared mode use the `installation` organization. In named mode, provision an organization and bind each new credential using the administration CLI:

```sh
node scripts/identity.mjs create-organization payments
COMPLYOS_ORGANIZATION_ID=payments node scripts/identity.mjs issue operator payments-review reviewer
COMPLYOS_ORGANIZATION_ID=payments node scripts/identity.mjs issue relay payments-relay finance-db
```

Use the same organization for role changes and revocation. Identity names are unique per credential kind across the deployment. Assessment uploads, reads, comparison history, collection health and AI assessment counts use the credential's stored organization. Collection alert history and webhook status also follow the authenticated organization. Each monitor runs for one configured organization. Device uploads inherit the organization in the server-side enrollment registry. Enroll with `node scripts/evidence.mjs enroll DEVICE ORGANIZATION` using an existing organization. Legacy hex-key entries and enrollments without an organization use `installation`. Retrieve an upload by its receipt with authenticated `GET /api/v1/evidence?id=SHA256`. Shared-hosting qualification still requires tenant-aware audit, evidence, delivery and database isolation.

### Database isolation for evidence

Device uploads, receipt lookups and local evidence imports run in transactions under the `complyos_evidence` role. PostgreSQL checks the transaction’s organization on reads and inserts. A missing organization context gives that role no visible rows. Each transaction releases its role and organization settings on commit or rollback.

Migration 011 creates a restricted non-login role and requires permission to manage roles and alter the evidence table. For a separately provisioned application login, grant it membership in `complyos_evidence` with permission to `SET ROLE`. Compose gives the migration job administrative access. Its two long-running services use separate non-administrative logins.

Migration 012 adds the `complyos_assessment` and `complyos_monitor` roles. Assessment uploads, history, summaries and graph reads use the first role. Alert sweeps use the second. Since migration 014, dashboard health checks use the read-only alert role. Grant separately provisioned runtime logins permission to switch into the roles their processes use. Graph views apply the caller’s row policies.

Migration 013 applies organization policies to alert episodes, failed checks, monitor heartbeats and webhook deliveries. The app reads alert history and delivery status under `complyos_alert_reader`. A webhook worker uses `complyos_delivery` to claim a queued event and record its outcome. If you provision separate logins, grant the app and worker permission to switch into their respective roles. The claim commits before the HTTP request so a slow receiver does not hold a database transaction open.

Migration 015 replaces the app’s direct identity-table grants with permission to call `public.authenticate_identity(text,text,text)`. A matching active credential returns the principal’s name, source, AI permission and organization. Collection health readers see active relay inventory for their current organization. Existing credentials continue to work. Deploy this migration together with the updated app because the previous app queried the table directly. For DBA-managed logins, replace the old identity-column grants with the function grant in [runtime provisioning](../scripts/provision-runtime.sql).

Run `node --test --test-concurrency=1 tests/integration/*.test.mjs` with `COMPLYOS_TEST_DATABASE_URL` pointing to a fresh disposable PostgreSQL database. The tests apply migrations, create organizations and open simultaneous connections.


### Operator permissions

In named mode, a **reviewer** can read assessments and an **analyst** can also list model providers, test connections and request AI summaries. To issue a review-only credential, run `node scripts/identity.mjs issue operator alice reviewer`. Change an existing credential with `node scripts/identity.mjs set-role operator alice analyst` or substitute `reviewer`. Changes take effect on the next API request. Existing operator credentials, issuance without a role, and shared operator mode retain analyst access for compatibility.

[Run a read-only pilot and reconcile the results](read-only-pilot.md)

[Configure the collection alert monitor](read-only-pilot.md#automated-collection-alerts)

[Enable signed webhook notifications for collection alerts](read-only-pilot.md#deliver-transitions-to-an-approved-webhook)

### Source observations in assessment evidence

New relay results carry `evidence.observations` through encrypted delivery, database storage and assessment history. Each record uses `complyos.observation/v1` and identifies the question checked (`kind`), the source reference, employee (`subject`), target, observation time, coverage and value.

| Kind | Source and scope | Reading the result |
|---|---|---|
| `hr.employment` | HR export revision and employee ID, dated at the extract time | Records active or terminated status. Stale and future-dated exports prevent a fresh database decision. |
| `entra.employee-id` | Microsoft Graph users lookup for the employee ID, dated at directory collection | A completed lookup can be matched, unmatched or ambiguous. An incomplete read yields unavailable coverage. This record appears when directory corroboration was requested. |
| `postgres.catalog-select` | Configured database source and exact schema/table pair, with the mapped role in the parent result | Reports the catalog SELECT decision. Partial coverage flags a traversal limit on the path explanation. A failed check has an unavailable result. A skipped check has no observation time. Login, network connectivity and actual data reads remain outside scope. |

Older assessments remain readable with their original evidence. The intake contract validates supplied observation records and checks that the PostgreSQL observation agrees with the enclosing assessment. [Connector contract](../packages/connector-sdk/observations.mjs)

In **Operations**, expand an employee's identity links to see which HR record, optional Entra account and PostgreSQL role supported the latest offboarding check. Links show the source and collection time. Review flags identify missing evidence or conflicting mappings. Employee keys are stable within an organization and relay source. The separate personal-data access report above checks approved business roles against observed database grants for classified tables.

### Save a personal-data review in Operations

Generate the review JSON using the current relay and owner-reviewed policy described above. Send that file to the control plane with a relay credential authorized for its source. Use HTTPS outside loopback.

```sh
curl --fail-with-body -H "Authorization: Bearer $RELAY_TOKEN" \
  -H 'Content-Type: application/json' --data-binary @/secure/review.json \
  "$CONTROL_URL/api/v1/access-reviews"
```

The receipt identifies the stored report. Retrying the same file returns the same receipt. In **Operations → Personal-data access reviews**, choose an assessment and expand an employee and table to inspect expected access, observed privileges, classification, exception and source evidence. After correcting a grant, collect and upload a fresh review. Select the earlier assessment for the same source and policy to compare outcomes. Check both policy versions when interpreting changes. A table omitted from the latest scope is labeled accordingly.

### Compare Saviynt approvals with observed access

The relay has a fixture-tested reader for Saviynt Enterprise Identity Cloud's runtime Analytics interface. A customer administrator must qualify the API version, response format, token permissions and analytics control in an authorized tenant before pilot use.

Create a read-only analytics control scoped to one PostgreSQL assessment source. Return one row per governance record and table, ordered by a stable unique record ID. Map Saviynt entitlement identifiers to exact database accounts and schema/table names using a data-owner-reviewed mapping. Include historical approvals and revocations as needed. The adapter calls `POST /ECM/api/v5/fetchRuntimeControlsDataV2` with `analyticsname`, `offset` and `max`; it expects a `results` array and a matching `totalcount` on every page. Configure the control to supply these aliases:

| Column | Expected value |
|---|---|
| recordId, employeeId | Unique governance record/table identifier and authoritative HR ID |
| account, schema, table | Exact PostgreSQL role, schema and table |
| entitlement, approvedRole | Entitlement label and business role recorded with the request |
| status | approved, revoked, pending or denied |
| expiresAt | ISO timestamp with timezone, or JSON null for no recorded expiry |

Supply the service account's current read-only token through `SAVIYNT_TOKEN`. Set `SAVIYNT_CONFIG` to the path of a local JSON file like this:

```json
{"origin":"https://tenant.example","source":"payments-primary","analyticsName":"PostgreSQL governance evidence"}
```

Run the existing access-report command and submit the report to Operations. Each employee/table row shows matching records beside the current HR role and observed grant. The owner's access policy still determines the outcome. A revoked or expired approval can coexist with an active database grant. A complete empty result means the configured control returned no match. Authentication failures, interrupted pagination, duplicate IDs and malformed responses mark governance evidence unavailable and discard partial pages. Each run reads a full snapshot. Collection time records when the relay read the analytics result; check the control's upstream refresh schedule separately.

### Use an enterprise identity provider for operator APIs

The app can verify signed OAuth access tokens issued by an OIDC identity provider. This mode supports one trusted issuer per installation. Register a dedicated API audience for ComplyOS. Configure the issuer to produce expiring RS256 or ES256 access tokens with the `at+jwt` type and the `iss`, `sub`, `aud`, `iat` and `exp` claims. Obtain the issuer and HTTPS signing-key URL from the provider's trusted discovery metadata. Providers that emit opaque access tokens or generic JWT headers require a compatible broker.

Create the organization first, provision named relay tokens for that organization, and create an administrator-managed membership file:

```json
{
  "issuer": "https://identity.example/realms/enterprise",
  "jwksUri": "https://identity.example/realms/enterprise/protocol/openid-connect/certs",
  "audience": "complyos-api",
  "members": [
    { "subject": "immutable-user-subject", "organization": "payments", "role": "reviewer" }
  ]
}
```

Set `AUTH_MODE=oidc` and `OIDC_CONFIG_FILE=/run/complyos/oidc.json` on the app. For Compose, add a read-only bind mount of the configuration directory to `/run/complyos` on the app service and recreate it. Use filesystem permissions that allow only administrators to change membership. A subject has one assignment per installation. Removing the entry or changing its role takes effect on the next API request. The analyst role also grants access to the configured model tools. Relay submissions continue to require named source-bound relay credentials.

With a short-lived access token for this API in the shell environment, request an assessment list:

```sh
curl --fail-with-body -H "Authorization: Bearer $ACCESS_TOKEN" "$CONTROL_URL/api/v1/assessments"
```

For dashboard sign-in, deploy a customer-managed OIDC login gateway in front of the app. The gateway owns the authorization-code flow, session cookies, logout and CSRF protections. Configure it to replace the Authorization header on operator requests with the signed API access token for the authenticated session. Route relay uploads separately so their named credentials reach the intake API. Validate the browser flow, token refresh, group changes and logout with the chosen provider before a shared rollout. The repository currently implements the token-verification side of this integration.

#### Qualify gateway login, refresh and logout

On the app, set `OIDC_GATEWAY_LOGIN_PATH` and `OIDC_GATEWAY_LOGOUT_PATH` to your gateway's same-origin action paths and recreate the app. For example, an oauth2-proxy deployment may expose `/oauth2/start` and `/oauth2/sign_out`. Configure the gateway's post-login destination as the dashboard and its post-logout destination as a signed-out page. Configure browser page requests to enter the login flow and unauthenticated operator API requests to return HTTP 401. The overview offers the configured login link after a 401 and the sign-out link in its header.

Use a pilot reviewer with a short access-token lifetime. Choose a timeout longer than the initial token lifetime plus the time needed for sign-in. From a workstation with Python Playwright and Chromium installed, run:

```sh
python scripts/qualify-oidc-gateway.py https://complyos.example payments reviewer --timeout 600
```

Complete login and any logout confirmation in the opened browser. The check starts with an empty browser context, verifies the expected organization and role, reads dashboard collection health, waits until the original access token expires and verifies a later expiry with the same session. It clicks the dashboard's sign-out link and checks that both operator APIs return 401. The session endpoint exposes the verified token expiry, organization and role to the current operator with caching disabled. The check does not print credentials, cookies or tokens. A successful run validates the gateway session at this application. Provider-wide logout and other applications' sessions require separate IdP verification.

### Evaluate an access review with Open Policy Agent

On the relay host, run an OPA 1.x server with the checked-in rule. Bind the pilot service to loopback. A remote deployment needs a trusted HTTPS service and access controls around its policy-management API.

```sh
opa run --server --addr=127.0.0.1:8181 policies/access-review/v1/policy.rego
```

In the relay shell set `OPA_ORIGIN=http://127.0.0.1:8181` and run the usual `node relay/access-report.mjs` command with the reviewed SOP and HR input. The relay first matches roles, grants and time-bound exceptions. It sends OPA only the expected permission, observed permission and active-exception flag for each row. The Rego rule classifies those inputs, including missing evidence. The relay requires one matching decision per row and the expected rule revision. A missing rule, outage or disagreement makes the command exit unsuccessfully before printing a report.

Successful reports include the evaluator path and revision alongside the owner's SOP ID and version. Upload the JSON as usual to see both in Operations. Existing reports remain readable. Leaving `OPA_ORIGIN` unset selects the built-in evaluator. To check a deployed decision endpoint against the full outcome matrix, run `TEST_OPA_ORIGIN=http://127.0.0.1:8181 node --test tests/opa-access-review.test.mjs`. Rule distribution and publication approvals remain administrator-managed.

### Approve a policy revision and replay a review

Apply migration 017 with the normal migration command. Use named or OIDC authentication and set `POLICY_APPROVERS` on the app to a JSON map from organization ID to permitted operator names (OIDC subjects in OIDC mode). For example, `{"payments":["payments-review"]}` grants the named payments reviewer publication rights in that organization. Recreate the app after changing the setting. Other authenticated reviewers can read their organization's registry and replay reports.

Review the versioned SOP JSON described above. To publish it immediately with a named operator, run the example below on an authorized workstation with jq installed. Curl prompts for the named operator's password. With OIDC, use the gateway's dedicated API access token as a Bearer credential instead. Use HTTPS outside loopback.

```sh
jq '{definition:.}' /secure/policy.json > /secure/approval.json
curl --fail-with-body -u payments-review -H 'Content-Type: application/json' \
  --data-binary @/secure/approval.json "$CONTROL_URL/api/v1/policy-registry"
```

For scheduled activation add an `effectiveAt` ISO timestamp with timezone beside `definition` before submission. Omit it for immediate activation. The receipt records the authenticated approver and server approval time. A revision is identified by organization, source, policy ID and version. To correct or supersede a revision, publish a new version. The database rejects backdating, duplicate versions and competing revisions at the same effective time.

List approved revisions with `GET /api/v1/policy-registry`. To obtain the currently effective definition for the relay, use an operator credential and the source and policy ID:

```sh
curl --fail-with-body -u payments-review --get --data-urlencode 'source=payments-primary' \
  --data-urlencode 'policy=KYC-ACCESS' "$CONTROL_URL/api/v1/policy-registry" -o /secure/effective-policy.json
```

After a successful download, use that file in the existing access-report command. In **Operations → Personal-data access reviews**, select a stored report and choose **Replay approved policy**. The server selects the latest revision effective at the report's collection timestamp, re-evaluates the retained employee status, business role, resource and observed privilege using the pinned v1 decision logic, and shows the recorded and replayed outcomes. Reports collected before the first effective approval show a coverage gap. This is a historical SOP comparison using retained observations. It performs no live collection or remote OPA execution. Signed OPA bundle distribution remains planned.
