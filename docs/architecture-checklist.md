# ComplyOS architecture implementation checklist

Read top down alongside the [2.0 system design](complyos-2-system-design.md). Each checkbox describes an independently verifiable capability. A checked pilot capability applies to the stated scope. Diagrams, illustrative metrics and simulated workflow stages describe product intent.

## 1–3. Platform, stack and application domains

- [x] Run a Next.js operator application, PostgreSQL control plane, customer-side collector and independent collection monitor. [Compose](../compose.yaml)
- [x] Share typed connector contracts and validate incoming assessment envelopes. [Connector SDK](../packages/connector-sdk)
- [ ] Extract the modular Fastify API with Zod/OpenAPI contracts and schema migrations for enterprise domains.
- [ ] Provide tenant administration and federation, integration registration, fleet management and collection scheduling.
- [ ] Complete normalization, identity resolution, graph, classification, regulatory, policy, incident, AI, remediation, evidence, reporting and notification domains. Individual pilot capabilities are tracked below.

## 4–6. Onboarding, agents and connectors

- [x] Configure a single installation, provision named operators and source-bound relay credentials, and collect from a configured scope. [Pilot runbook](read-only-pilot.md)
- [ ] Implement tenant onboarding through SSO, applicability, connector discovery, baseline approval, initial assessment and continuous monitoring.
- [x] Collect Linux and Windows privilege evidence with HMAC-authenticated bundles. Buffer outbound PostgreSQL assessments in an encrypted local queue. [Collectors](../collectors) · [Relay](../relay)
- [ ] Deliver enrolled Go relay and endpoint agents, certificate rotation/revocation, signed jobs and updates, proxy support, fleet health, high availability and signed OS packages including macOS.
- [x] Ingest mapped HR CSV/JSON, corroborate exact Entra employee IDs and query PostgreSQL catalog privileges. [Connectors](../connectors)
- [x] Import bounded AWS/GitHub CLI and scanner evidence and check selected personal identifiers in code logging. [Evidence importer](../scripts/evidence.mjs) · [Code check](../scripts/code-scan.mjs)
- [ ] Validate Entra against an authorized live tenant. Extend the SDK with manifests, discovery, checkpoints, coverage, verification and typed action capabilities. Integrate AWS IAM/S3 and GitHub App observations into access reviews.
- [ ] Add delegated cloud connectors, private enterprise adapters and CI checks bound to change approval. Expand endpoint posture signals and enterprise management integrations.

## 7–9. Ingestion, temporal graph and identity resolution

- [x] Validate, deduplicate and transactionally store assessment uploads. Backfill evidence-linked graph edges and reconstruct bounded PostgreSQL grant paths. [Store](../lib/store.mjs) · [Graph migration](../migrations/007-access-graph.sql)
- [x] Preserve unknown results for missing or ambiguous HR mappings, incomplete Entra evidence and stale HR snapshots. [Assessment engine](../relay/offboarding.mjs)
- [ ] Implement general observation envelopes, event outbox, idempotent projection workers and scheduled reconciliation. Introduce JetStream when fan-out requires it.
- [ ] Persist cross-provider canonical identities, review ambiguous links, classify datasets and query temporal graph paths and impact across providers.

## 10–12. Regulatory intelligence, policy and incidents

- [x] Compare scoped database reads with a supplied reviewed policy, current business role, dataset classification and time-bound exception. Report excess, missing, expected and unknown access. [Report engine](../lib/access-report.mjs)
- [ ] Ingest official regulations and company SOPs, version amendments, capture applicability and specialist approval, and publish evidence requirements and reviewed DPDP/internal control mappings.
- [ ] Build a policy registry and OPA evaluation with change-triggered and scheduled runs. Persist coverage, errors, stale evidence, exceptions and applicability independently.
- [x] Track collection-health alert episodes, acknowledge them and retry signed webhook delivery. [Alerts](../lib/collection-alerts.mjs)
- [ ] Correlate access violations into durable incidents with stable fingerprints, ownership, evidence, coverage-aware risk, prioritization and lifecycle history.

## 13–15. AI, remediation and end-to-end workflows

- [x] Test customer-selected compatible model connections and generate bounded assessment summaries. [AI adapter](../lib/ai.mjs)
- [ ] Implement scoped investigation, regulatory retrieval, risk explanation, action planning, evidence review and reporting tools. Test authorization, citations, redaction and model outputs.
- [x] Recollect PostgreSQL privileges after an operator changes access and compare assessment history. Test independent grant paths and transfer-policy drift. [Offboarding tests](../tests/offboarding.test.mjs) · [Access report tests](../tests/access-report.test.mjs)
- [ ] Deliver action catalog, impact preview, exact-target approval, OPA preconditions, Temporal execution, retry/reconciliation and independent closure verification.
- [ ] Validate the full offboarding sequence across HR, identity, cloud, code and database, including a partial failure and a surviving alternate path.

## 16–18. Storage, API and frontend

- [x] Store assessments, observations, graph edges, credentials, alert episodes and deliveries with additive PostgreSQL migrations. [Migrations](../migrations)
- [x] Serve authenticated latest assessments through GET /api/v1/assessments. Restrict latest-per-source selection to the authenticated organization. Preserve the legacy URL and use v1 from the operations UI. [Versioned route](../app/api/v1/assessments/route.js) · [Compatibility and isolation test](../tests/operator-routes.test.mjs)
- [x] Bind named operators and relays to persisted organizations, migrate existing memberships and scope assessment intake, latest reads, history, model counts and collection health. [Organization migration](../migrations/008-organizations.sql)
- [x] Isolate collection alert episodes, recovery evidence, monitor heartbeats, webhook claims and delivery status by organization. [Isolation regression test](../tests/alert-organizations.test.mjs)
- [x] Bind device evidence uploads to enrollment ownership and scope receipt lookup to the authenticated organization. [Isolation test](../tests/device-organizations.test.mjs)
- [x] Enforce row-level security on collected evidence. Test simultaneous organizations, unfiltered reads, rejected foreign writes and pooled connection reuse on PostgreSQL 17. [Database integration test](../tests/integration/evidence-rls.test.mjs)
- [x] Apply row-level security to assessments, results and graph edges. Read both graph views with the caller’s permissions and check concurrent organizations on PostgreSQL. [Integration test](../tests/integration/assessment-rls.test.mjs)
- [x] Enforce row-level security on alert episodes, failed checks, monitor heartbeats and webhook deliveries. Verify concurrent organizations sharing a source and webhook destination. [PostgreSQL integration test](../tests/integration/monitoring-rls.test.mjs)
- [x] Use a one-shot migration job and separate application and worker logins. Verify named dashboard reads, a monitoring sweep, and denial of administrative writes and role switching. [Runtime login integration test](../tests/integration/runtime-logins.test.mjs)
- [ ] Version the remaining APIs. Add tenant/connector administration, agent enrollment/heartbeat, observation batches, graph queries, policies, incidents, approvals, reports and replay endpoints. Add SSE progress and gateway protocols as their consumers ship.
- [x] Provide overview design system, live operations, assessment comparisons, local access report viewer, connection settings and monitoring. [Frontend](../app)
- [x] Drive overview counts from current PostgreSQL checks and show sources with stale or missing collections.
- [ ] Deliver dedicated graph, incident, regulation, policy, remediation, fleet, administration and auditor workspaces with persona-specific authorization.

## 19–21. Evidence, security and deployment

- [x] Record source evidence, collection times and policy versions; export local review and reconciliation results. [Reports](../app/reports) · [Reconciliation](../lib/reconcile.mjs)
- [ ] Deliver signed manifests, protected object retention, key lifecycle, auditor verification and historical replay through approvals, execution and closure.
- [x] Authenticate operators and relays, support credential revocation and gate model use by role. [Authentication](../lib/auth.mjs)
- [ ] Add enterprise IdP, least-privilege tenant roles, separation of duties, scoped secrets, API limits, security audit logs, supply-chain checks and workload identity.
- [x] Package single-installation development deployment in Docker Compose. [Deployment definition](../compose.yaml)
- [ ] Validate managed AWS and self-hosted editions, network boundaries, secrets, backups, restoration, residency and updates. Assess offline distribution for air-gapped customers.

## 22–24. Capacity, observability and repository structure

- [x] Document workload assumptions, size estimates and service objectives; expose source freshness and delivery status. [Design](complyos-2-system-design.md) · [Collection health](../lib/collection-health.mjs)
- [ ] Load-test ingestion and graph queries, measure detection lag and API latency, exercise connector failures and demonstrate recovery objectives.
- [ ] Correlate traces, metrics and logs across intake, policy and verification. Add OpenTelemetry, dashboards and actionable operational alerts.
- [x] Separate relay, connectors, migrations, SDK contracts, application and tests into repository modules.
- [ ] Extract independently deployable API, workers, Go agents and infrastructure packages as implemented. Add release pipelines and connector-contract, browser and tenant-isolation suites.

## 25–27. Delivery, V1 scope and decisions

- [x] Establish the pilot roadmap and architecture decisions. Implement read-only HR/PostgreSQL offboarding, optional Entra corroboration and local access reporting. [Delivery plan](implementation-plan.md)
- [ ] Meet V1 acceptance for all five connectors, enterprise identity-to-data graph, private relay, incident engine, evidence-grounded investigator, approved remediation, reviewed regulatory packs and evidence vault.
- [ ] Complete the authorized read-only enterprise pilot, reconcile findings with the data owner and record measured coverage, security, recovery and performance results.

## Ordered engineering queue

1. [x] HR intake, Entra identity corroboration and SOP-based access review.
2. [x] Migrate the operations assessment read to the documented v1 endpoint and verify backward compatibility.
3. [x] Establish persistent organizations and membership for named operators and relays. Backfill existing identities into the installation organization and require server-derived organization context.
4. [x] Apply organization context to the current assessment, graph, history, monitoring, evidence, AI summary and delivery paths. Exercise the existing PostgreSQL isolation and migration tests.
5. [x] Run six pull-request checks, including real PostgreSQL isolation and a Compose restart with retained data. [CI workflow](../.github/workflows/pilot.yml)
6. [x] Restrict named authentication to an exact credential lookup. Test migration of existing grants, scoped relay inventory and immediate revocation using runtime logins.
7. [ ] Require all six check names in GitHub branch rules and qualify upgrades from a previous release before a shared deployment. [Secure pilot plan](implementation-plan.md#secure-pilot-review-and-next-pull-request)
8. [x] Connect the overview to measured assessment results and source freshness.
9. [x] Carry versioned HR, optional Entra and PostgreSQL source observations through assessment intake with explicit time, provenance and coverage.
10. [ ] Link source observations to stable cross-system identities and advance the incident phases in the [delivery plan](implementation-plan.md).
