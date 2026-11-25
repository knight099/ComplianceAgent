# ComplyOS 2.0 architecture visual gallery

These static illustrations recreate the supplied architecture and product references. The design document contains the editable Mermaid diagrams, calculation formulas and implementation details. [System design](complyos-2-system-design.md)

- [1. High-level system architecture](#1-high-level-system-architecture)
- [4. Enterprise onboarding architecture](#4-enterprise-onboarding-architecture)
- [5. Agent and collector architecture](#5-agent-and-collector-architecture)
- [7. Data ingestion and event-driven architecture](#7-data-ingestion-and-event-driven-architecture)
- [8. Compliance Graph](#8-compliance-graph)
- [9. Cross-system identity resolution engine](#9-cross-system-identity-resolution-engine)
- [10. Regulatory intelligence engine](#10-regulatory-intelligence-engine)
- [13. Agentic AI architecture](#13-agentic-ai-architecture)
- [14. Remediation orchestration architecture](#14-remediation-orchestration-architecture)
- [15. Complete end-to-end use case](#15-complete-end-to-end-use-case)
- [16. Database architecture](#16-database-architecture)
- [18. Frontend application architecture](#18-frontend-application-architecture)
- [19. Evidence vault and audit architecture](#19-evidence-vault-and-audit-architecture)
- [21. Deployment architecture](#21-deployment-architecture)
- [22. Scalability and performance design](#22-scalability-and-performance-design)
- [25. Implementation plan](#25-implementation-plan)
- [26. Minimum viable enterprise product](#26-minimum-viable-enterprise-product)

## 1. High-level system architecture

![High-level system architecture](diagrams/gallery/system-architecture.svg)

## 4. Enterprise onboarding architecture

![Enterprise onboarding architecture](diagrams/gallery/enterprise-onboarding.svg)

## 5. Agent and collector architecture

### 5.1 Internal Go agent architecture

![5.1 Internal Go agent architecture](diagrams/gallery/endpoint-agent.svg)

### 5.2 Enterprise relay

![5.2 Enterprise relay](diagrams/gallery/enterprise-relay.svg)

## 7. Data ingestion and event-driven architecture

![Data ingestion and event-driven architecture](diagrams/gallery/data-ingestion.svg)

## 8. Compliance Graph

![Compliance Graph](diagrams/gallery/compliance-graph.svg)

## 9. Cross-system identity resolution engine

![Cross-system identity resolution engine](diagrams/gallery/identity-resolution.svg)

## 10. Regulatory intelligence engine

![Regulatory intelligence engine](diagrams/gallery/regulatory-intelligence.svg)

## 13. Agentic AI architecture

![Agentic AI architecture](diagrams/gallery/agentic-ai.svg)

## 14. Remediation orchestration architecture

![Remediation orchestration architecture](diagrams/gallery/remediation.svg)

## 15. Complete end-to-end use case

### Step 1 of 6 — HR termination

![Step 1 of 6 — HR termination. Detected. 4 access paths remain and 0 have been revoked.](diagrams/gallery/offboarding-1.svg)

### Step 2 of 6 — Cross-system discovery

![Step 2 of 6 — Cross-system discovery. Violation established. 4 access paths remain and 0 have been revoked.](diagrams/gallery/offboarding-2.svg)

### Step 3 of 6 — AI investigation

![Step 3 of 6 — AI investigation. Investigation complete. 4 access paths remain and 0 have been revoked.](diagrams/gallery/offboarding-3.svg)

### Step 4 of 6 — Approval

![Step 4 of 6 — Approval. Approved. 4 access paths remain and 0 have been revoked.](diagrams/gallery/offboarding-4.svg)

### Step 5 of 6 — Remediation

![Step 5 of 6 — Remediation. Partially remediated. 1 access paths remain and 3 have been revoked.](diagrams/gallery/offboarding-5.svg)

### Step 6 of 6 — Retry and verification

![Step 6 of 6 — Retry and verification. Verified. 0 access paths remain and 4 have been revoked.](diagrams/gallery/offboarding-6.svg)

## 16. Database architecture

### Core entity relationship diagram

![Core entity relationship diagram](diagrams/gallery/core-entities.svg)

## 18. Frontend application architecture

### Compliance overview

![Compliance overview](diagrams/gallery/compliance-dashboard.svg)

## 19. Evidence vault and audit architecture

![Evidence vault and audit architecture](diagrams/gallery/evidence-vault.svg)

## 21. Deployment architecture

### 21.1 SaaS deployment on AWS

![21.1 SaaS deployment on AWS](diagrams/gallery/aws-deployment.svg)

## 22. Scalability and performance design

### Enterprise ingestion capacity example

![Enterprise ingestion capacity example](diagrams/gallery/ingestion-capacity.svg)

## 25. Implementation plan

![24-week engineering roadmap with nine overlapping workstreams](diagrams/complyos-24-week-roadmap.svg)

## 26. Minimum viable enterprise product

### ComplyOS V1 scope

![ComplyOS V1 scope](diagrams/gallery/complyos-v1.svg)
