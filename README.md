# ComplyOS

ComplyOS helps a security team answer a practical question: **after someone leaves the company, does their database role still have permission to read a sensitive table?** The current pilot checks PostgreSQL. It records which employee, role and table were checked, what the collector found, and when it checked. An administrator can remove a grant and collect again to see whether another path still gives the employee read access.

The long-term goal is to do this across HR, identity, cloud, databases and code hosting. The planned platform will link access to company rules and regulatory obligations, explain violations, route proposed fixes for approval and keep the evidence that a fix worked.

## How a check works today

1. A data owner chooses the tables to check and provides a current HR file mapping employees to database roles. Microsoft Entra ID can optionally corroborate employee IDs.
2. A small program called the **relay** runs inside the customer’s network. It reads PostgreSQL’s permission records, including permissions inherited through other roles. Customer table contents stay in the database.
3. The relay queues the results locally and uploads them to the **control plane**, the application that stores assessments and serves the review screens.
4. In **Operations**, a reviewer sees retained grants, tables with no scoped grant, and checks with insufficient evidence. Two dated assessments show what changed after an administrator corrected access. A separate report can compare an employee’s current business role with a company-approved access policy.

## Start locally with Docker Compose

**You need** Git, Docker with the Compose plugin, and a free local port 3000. Compose starts the app, PostgreSQL 17 and the collection monitor. A source database, HR file and AI account are optional for starting the app.

```sh
git clone --branch develop/enterprise-core https://github.com/knight099/ComplianceAgent.git
cd ComplianceAgent
```

Create a private `.env` file in that directory with the following five entries. Replace each example value with a different secret. Use URL-safe values for all three database passwords. Hex strings work for all five secrets. You can generate each one with `openssl rand -hex 32`. Keep this file for subsequent starts.

```dotenv
POSTGRES_PASSWORD=replace_with_the_database_admin_password
APP_DB_PASSWORD=replace_with_a_separate_app_database_password
WORKER_DB_PASSWORD=replace_with_a_separate_worker_database_password
OPERATOR_PASSWORD=replace_with_an_operator_password
RELAY_TOKEN=replace_with_a_relay_upload_token
```

```sh
docker compose up --build -d
docker compose ps
```

On an existing installation, keep the original `POSTGRES_PASSWORD` and database volume. Add the two new database passwords before running the command above. The `migrate` job applies the schema and provisions both logins. An exit code of zero for that job means the app and worker can start. Rerun `docker compose up --build -d` after rotating either runtime password in the file.

Open [Operations](http://localhost:3000/operations). When prompted, use the username `operator` and the `OPERATOR_PASSWORD` from your file. A fresh installation shows an empty inventory until a relay submits its first assessment. The [overview](http://localhost:3000/) shows illustrative figures. Use Operations for actual results.

For a login or startup problem, check `docker compose logs migrate app db collection-monitor`. Stop the stack with `docker compose down`; its named volumes retain the database and enrollment files.

## What is built and what is planned

| High-level layer | Working in the pilot | Still to build |
|---|---|---|
| Screens | Live operations, assessment comparison, local report viewer and optional summaries from a customer-selected model. The overview shows the intended design. | Live overview metrics, auditor portal and administration screens. |
| API and access control | Next.js APIs, named reviewers and analysts, source-bound relay credentials and organization-scoped queries. PostgreSQL enforces organization isolation for collected evidence, assessments, individual results, access paths, collection alerts and webhook deliveries. | Enterprise single sign-on, rate limits, a separate Fastify API and database-enforced isolation across the remaining tables. |
| Identity and access graph | Reviewed HR mappings, optional Entra matches and dated paths from PostgreSQL roles to tables. | A common identity and access history across cloud, apps, databases and devices. |
| Policies, regulations and incidents | Offboarding checks, comparison against an owner-reviewed access policy, and alerts when collection fails or becomes overdue. | Reviewed regulatory packs, a versioned OPA policy service and access incidents that combine findings across systems. |
| Investigation, fixes and evidence | AI can explain assessment counts and freshness. Reviewers can compare fresh observations after a manual fix. Signed device uploads can be retrieved by receipt. | Investigation with evidence citations, approved automated fixes, independent checks across providers and auditor replay. |
| Events and workflows | Encrypted upload retries, a collection monitor and a persistent queue for signed alert webhooks. | A shared event bus (NATS JetStream) and durable approval and remediation workflows (Temporal). |
| Storage | PostgreSQL stores assessments, results, graph records, evidence and alert history. SQLite buffers relay uploads. | Protected object storage for evidence, vector search for regulations and Redis caching where needed. |
| Gateway and customer-side collection | Outbound relay uploads, signed Linux and Windows privilege evidence, HR and PostgreSQL collection, optional Entra lookup and limited AWS, GitHub and scanner evidence imports. | Certificate-based gateway, managed Go relay and endpoint fleet, production cloud connectors and integrated CI/CD checks. |

[High-level system design](docs/complyos-2-system-design.md) · [Detailed implementation checklist](docs/architecture-checklist.md) · [Engineering roadmap](docs/implementation-plan.md) · [Dashboard design system](docs/design-system.md)

## Architecture diagrams

**Running today**

```mermaid
flowchart LR
 HR["HR extract and identity mappings"] --> Relay["Customer-side Node.js relay"]
 DB["Private PostgreSQL catalogs"] --> Relay
 Relay --> Spool["Encrypted SQLite queue"]
 Spool -->|Outbound HTTPS| API["Next.js assessment API"]
 API --> Store[("PostgreSQL assessments and evidence")]
 Store --> Review["Review, reconcile and compare"]
 Store --> Monitor["Collection monitor"]
 Monitor --> Outbox["Durable alert outbox"]
 Outbox --> Receiver["Optional signed webhook"]
 Review -->|Aggregate results| Model["Operator-selected LLM"]
```

**Enterprise target**

```mermaid
flowchart LR
 subgraph Customer["Customer data plane"]
 Sources["HR, identity, cloud, database and CI evidence"] --> Relay["Read-only connectors and private relay"]
 Executor["Separate typed remediation executor"] --> Sources
 end
 subgraph Control["Control plane"]
 Intake["Tenant-authorized intake"] --> Graph["Versioned identity and data graph"]
 Graph --> Policy["Reviewed controls and regulatory mappings"]
 Policy --> Incident["Incident and impact preview"]
 Incident --> Gate["Policy check and human approval"]
 Gate --> Workflow["Durable workflow"]
 end
 Relay -->|Outbound authenticated transport| Intake
 Executor -->|Poll for approved work| Workflow
 Relay -->|Independent recollection| Verify["Verify all in-scope access paths"]
 Verify --> Replay["Historical evidence and auditor replay"]
```

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

Open [Operations](http://localhost:3000/operations). If your DBA manages logins independently, `node scripts/migrate.mjs` still applies only the schema. The [runtime grants](scripts/provision-runtime.sql) list the permissions each login needs.

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

Select **AI Copilot** in the overview to open **AI model connection**. Select a provider, enter an exact model ID available to your account, provide the API key when the provider requires one, and select **Test connection**. Select an assessment and **Generate summary** to explain its counts and freshness. Each browser session supplies its own credentials. Reloading or clearing the connection releases the key from application state. Use HTTPS when operating remotely and keep request bodies and authorization headers out of proxy logs.

OpenAI is available by default. To offer a private gateway, Ollama, vLLM or another OpenAI-compatible service, set the following on the **app server** and restart it (recreate the app container for Compose):

```sh
export AI_ENDPOINTS='{"OpenAI":"https://api.openai.com/v1/chat/completions","Internal model":"https://models.example.org/v1/chat/completions"}'
```

Replace the example URL with the full chat-completions endpoint. The provider must accept a model and messages and return text in `choices[0].message.content`. The server uses bearer authentication when a key is supplied. Private keyless models can leave the key blank. Loopback HTTP is supported for local inference; inside a container loopback refers to that container. Endpoints using other protocols or authentication schemes need a compatible gateway. Test calls may incur provider charges.

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

Run `node --test --test-concurrency=1 tests/integration/*.test.mjs` with `COMPLYOS_TEST_DATABASE_URL` pointing to a fresh disposable PostgreSQL database. The tests apply migrations, create organizations and open simultaneous connections.


### Operator permissions

In named mode, a **reviewer** can read assessments and an **analyst** can also list model providers, test connections and request AI summaries. To issue a review-only credential, run `node scripts/identity.mjs issue operator alice reviewer`. Change an existing credential with `node scripts/identity.mjs set-role operator alice analyst` or substitute `reviewer`. Changes take effect on the next API request. Existing operator credentials, issuance without a role, and shared operator mode retain analyst access for compatibility.

[Run a read-only pilot and reconcile the results](docs/read-only-pilot.md)

[Configure the collection alert monitor](docs/read-only-pilot.md#automated-collection-alerts)

[Enable signed webhook notifications for collection alerts](docs/read-only-pilot.md#deliver-transitions-to-an-approved-webhook)
