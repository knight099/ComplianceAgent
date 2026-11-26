# ComplyOS 2.0 implementation plan

[Architecture implementation checklist](architecture-checklist.md)

The [system design](complyos-2-system-design.md) defines the target. Weeks are overlapping estimates from kickoff. The [architecture and module inventory](architecture.md) records the implemented baseline and the [pilot runbook](read-only-pilot.md) describes the workflow available today.

## Delivery phases

| Phase | Starting point and work | Acceptance evidence |
|---|---|---|
| 1 · Core platform · weeks 1–4 | Preserve existing Next.js clients, versioned assessment intake and PostgreSQL migrations. Introduce Fastify with shared TypeScript/Zod contracts, OpenAPI, OIDC and tenant-scoped storage. | A legacy relay upload, retry and historical read survive migration. Two tenants with identical external IDs cannot read each other's records, queued work or exports. |
| 2 · Enterprise graph · weeks 4–7 | Extend the HR-to-PostgreSQL snapshot projection with validity intervals, cross-source identity resolution, data classification and bounded traversal. | Reconstruct two independent paths at a specified time. Trace each hop to a source observation. Route ambiguous identities to review and retain unknown coverage. |
| 3 · Collection infrastructure · weeks 6–12 | Extend read-only collection to HR, Entra, PostgreSQL, AWS IAM/S3 and GitHub. Port the relay to Go with certificate enrollment, revocation and encrypted buffering. | Exercise pagination, partial permissions and stale evidence per connector. Restart a disconnected relay and replay its queue without duplicate observations. Record live sandbox validation separately from fixture coverage. |
| 4 · Compliance detection · weeks 10–13 | Evaluate reviewed policies on graph changes and scheduled reconciliation. Add applicability, expiring exceptions, incident fingerprints and coverage reporting. | Repeated observations update one incident. An expired exception triggers evaluation. An unavailable required source yields an explicit coverage gap. |
| 5 · Safe remediation · weeks 13–17 | Persist typed plans and exact parameters, check policy and approval expiry, execute with scoped credentials and reconcile uncertain outcomes using Temporal. | Interrupt a workflow after an external change. Recover the receipt or reconcile state before retry. Keep an incident open when fresh collection finds another access path. |
| 6 · Evidence and intelligence · weeks 15–21 | Store signed manifests and retained evidence objects. Version government sources and company SOPs. Add specialist review, retrieval, scoped AI tools and auditor reports. | Replay a historical decision using the original observations, policy, approvals and verification. Validate signatures. An investigation cites authorized evidence through the tenant's selected provider. |
| 7 · Enterprise pilot · weeks 21–24 | Run isolation, load, recovery and failure-injection tests. Deploy read-only in an authorized environment and reconcile findings with the data owner. | Record observed latency, freshness, missing sources and restore results against the objectives in design section 22. Obtain owner review of retained access, unexplained grants and unresolved identities. |

## Next build sequence

1. **HR intake implemented.** CSV exports use configurable columns and the existing JSON assessment contract. Automated tests cover equivalent assessments, duplicate IDs, missing mappings and shared roles.
2. **Directory correlation implemented for the offboarding relay.** The optional read-only Entra adapter records exact employee-ID match evidence and collection time. Tests cover pagination, duplicates, missing identities and partial visibility. Authorized live-tenant validation remains open.
3. **Access report implemented for PostgreSQL.** The local relay report compares scoped read privileges with reviewed business-role expectations and time-bound exceptions. The Reports page displays observations, policy references and grant evidence. Production policy approval, centralized report history and additional data sources remain open.
4. **Platform foundation.** The operations workspace now reads its authenticated organization through the [versioned assessments API](assessment-api.openapi.yaml). Named operator and relay credentials carry persistent organization membership. Assessment intake, latest reads, history, AI counts and collection health use this context. Collection alerts, sweep heartbeats and webhook deliveries are scoped by organization. Device evidence intake and receipt lookup use enrollment and operator organization membership. PostgreSQL enforces row-level security on collected evidence, assessment snapshots, results, graph projections, alert episodes, failed checks, heartbeats and webhook deliveries. Compose provisions separate non-administrative application and worker logins before service startup. The overview shows current offboarding outcomes and sources needing review. Run the phase 1 compatibility and isolation checks.

Use HR, Entra and PostgreSQL offboarding as the first end-to-end acceptance case. Extend the same graph to role transfers and excessive sensitive-data access. Introduce approved writes in a controlled environment after the workflow recovery and verification gates pass. The enterprise pilot starts in read-only mode.

## Secure pilot review and next pull request

The November 26 review starts at `90ab52c` and includes an update for `e27fc50`. At `2a0c5d0`, the HR-to-PostgreSQL offboarding check remains the working pilot. Its negative finding covers the selected database privileges. A live customer deployment, organization-wide access discovery and automated remediation remain open milestones.

| Review finding | Evidence at the reviewed branch head | Remaining work |
|---|---|---|
| Database isolation and permissions | Migrations 011–013 cover evidence, assessments, results, graph projections, alerts, heartbeats and deliveries. A one-shot migration job provisions separate app and worker logins. Migration 014 gives the dashboard read-only collection health. | Review the pre-authentication identity lookup and direct grants on the identity registry. Prove the full Compose startup and upgrade on a clean runner. |
| Graph maintenance | A retained assessment inserted through the scoped assessment role triggers graph projection. The integration test reads the resulting edges and paths under two concurrent organizations. | Preserve the insert-only projection. Define separate permissions and tests if a future maintenance job needs to rewrite edges. |
| Identity, coverage and product scope | The relay uses reviewed HR-to-database mappings, optional exact Entra matches and a PostgreSQL-specific graph. AI summarizes counts. The administrator changes access and the relay checks again. | Add mapping provenance and review, a machine-readable coverage statement, provider-neutral observation contracts and authorized live Entra validation. Correlated access incidents, sourced regulatory controls, enterprise SSO and durable remediation remain planned. |
| Repeatable verification | The repository has a Node regression suite and four integration test files for real PostgreSQL. The default test command excludes the integration directory. No GitHub Actions workflow is tracked at this revision. | Publish a repeatable result on every pull request before expanding the overview or graph. |

### Next item — continuous integration for the secure pilot

1. Add a GitHub Actions workflow for pull requests targeting `develop/enterprise-core` and pushes to that branch. Use Node 24, the committed lockfile, read-only repository permissions and disposable credentials.
2. Run `npm ci`, `npm test` and `npm run build`. In a separate job start fresh PostgreSQL 17, wait for readiness, set `COMPLYOS_TEST_DATABASE_URL` and run `node --test --test-concurrency=1 tests/integration/*.test.mjs`. These tests provision cluster roles and must have their own disposable database.
3. Exercise the documented Compose startup on a runner with sufficient disk. Require a successful migration exit, an authenticated assessment read and a completed worker sweep. Restart with the same volume and verify an existing assessment remains readable. Add dependency auditing and secret scanning as distinct checks with a documented failure policy.
4. Verify the workflow on a pull request. Demonstrate that a deliberately failing isolation assertion makes the integration check fail, then restore it and record the passing run. Configure the agreed checks as required for merging where repository administration access permits.

**Acceptance evidence.** A reviewer can open the PR checks and identify the build, regression, PostgreSQL isolation, Compose startup and security results separately. Missing integration configuration or a failed migration fails its job. A green workflow is the prerequisite for the next security change. Migration 015 restricts identity lookup and relay inventory. The measured overview uses organization-scoped collection health. The relay now attaches versioned HR, Entra and PostgreSQL observations with provenance and coverage. Next, link observations to stable identities and retain mapping provenance for review.

The [Secure pilot workflow](../.github/workflows/pilot.yml) defines six PR checks. Dependency auditing fails on high or critical advisories in the lockfile. Secret scanning fails on detected secrets in introduced commits and redacts matched values. A runner or scanner error also fails its job. The [Compose check](../scripts/ci-compose.sh) uses disposable credentials and retains its test volume across service recreation.

### Identity linking and the personal-data access milestone

Operations now groups the latest assessment by employee within its organization and relay source. Each supported HR, directory or database identity link shows its source and observation time. The same employee ID keeps its key across runs in that scope. Shared accounts, conflicting records and missing evidence require review. The assessment retains the underlying observations.

Next, bring the local personal-data access report into the authenticated assessment workflow. Persist the owner's classification and policy version, expected access by business role, observed PostgreSQL grant, exception expiry and evidence coverage. Acceptance requires a reviewer to distinguish excess access, an approved exception and insufficient evidence, then compare a fresh assessment after a correction. Reviewed regulatory mappings follow this control. Each mapping needs a source clause, version and reviewer before it can support a regulatory assessment.
