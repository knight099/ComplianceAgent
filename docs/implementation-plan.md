# ComplyOS 2.0 implementation plan

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
3. **Access report.** For each in-scope person and dataset, show effective privilege, grant path, expected access from a reviewed SOP, applicable exception and freshness. Distinguish excess access, expected access, missing expected grants and insufficient evidence. Include the policy version and source references in the report.
4. **Foundation in parallel.** Migrate assessment reads behind the versioned API and enforce organization scope through storage and authorization before enabling shared deployments. Run the phase 1 compatibility and isolation checks.

Use HR, Entra and PostgreSQL offboarding as the first end-to-end acceptance case. Extend the same graph to role transfers and excessive sensitive-data access. Introduce approved writes in a controlled environment after the workflow recovery and verification gates pass. The enterprise pilot starts in read-only mode.
