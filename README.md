# ComplyOS

ComplyOS helps security teams check who still has permission to read sensitive PostgreSQL tables. For example, when an employee leaves, their old database role may still inherit read access through a group. ComplyOS shows the grant and the evidence behind it so an administrator can remove it and check again.

![ComplyOS dashboard showing fresh checks, retained access, unknown results and sources needing review](docs/images/dashboard.png)

*The running dashboard with illustrative collection data. A new installation shows an empty inventory until its first collection.*

## How it works

1. **Choose the scope.** A data owner lists the tables to check and supplies an HR file linking employees to database roles. An optional Microsoft Entra ID lookup helps confirm identities.
2. **Collect permissions.** A read-only relay inside your network inspects PostgreSQL permission records. Customer table contents stay in the database.
3. **Review the findings.** Open **Operations** to see retained access, missing evidence and the identity links behind each check. After an administrator changes a grant, run another collection and compare the results.
4. **Check company policy.** Generate a local report comparing grants with the business roles allowed to read each classified table. Open it locally in **Reports**, or [submit it to Operations](docs/operator-guide.md#save-a-personal-data-review-in-operations) to retain the evidence and compare two collections.

These checks measure database permissions. Establishing who actually read a record requires database audit logs. Regulatory control mappings and automated remediation are on the [roadmap](docs/implementation-plan.md).

## Start locally

Install Git, Docker with Compose and OpenSSL. On a new installation, clone the repository and create a private file containing separate random credentials.

```sh
git clone https://github.com/knight099/ComplianceAgent.git
cd ComplianceAgent
(umask 077; set -C; for key in POSTGRES_PASSWORD APP_DB_PASSWORD WORKER_DB_PASSWORD OPERATOR_PASSWORD RELAY_TOKEN; do
  echo "$key=$(openssl rand -hex 32)"
done > .env)
docker compose up --build -d
docker compose ps -a
```

Open the [dashboard](http://localhost:3000). When prompted, sign in as `operator` with the `OPERATOR_PASSWORD` in your local `.env`. Keep this file for later starts. The `migrate` service exits successfully after preparing the database. To troubleshoot startup, run `docker compose logs migrate app db`.

To see your first results, follow the [read-only collection instructions](docs/operator-guide.md#run-a-read-only-collection). Stop the local services with `docker compose down`. Their named volumes retain the data.

## Enterprise connections

### Laptop and security tools

| Category | Tools | How to connect today |
|---|---|---|
| Device management (MDM / UEM) | Microsoft Intune, Jamf, Workspace ONE | Use the read-only Intune audit below. Native Jamf and Workspace ONE connectors are planned. |
| Identity management | Microsoft Entra ID, Active Directory, Okta | For Entra employee matching, supply a Microsoft Graph token in `ENTRA_ACCESS_TOKEN` with permission to read users and their employee IDs, then add `--entra` to the HR collection command. Native on-premises AD and Okta inventory connectors are planned. [Entra setup](docs/operator-guide.md#collect-from-hr-csv-and-entra-id) |
| Endpoint detection and response (EDR) | CrowdStrike, Microsoft Defender for Endpoint, SentinelOne | Native connectors for endpoint sensor health and detections are planned. |
| Data loss prevention (DLP) | Microsoft Purview, Forcepoint | Native connectors for DLP policy assignments and events are planned. |
| Remote management | Microsoft Configuration Manager, ManageEngine, Tanium | IT can distribute the collector scripts through its existing deployment process. Native inventory and remote-action connectors are planned. |
| VPN / Zero Trust | Zscaler, GlobalProtect, Netskope | Native connectors for device posture and network access decisions are planned. |
| IT asset management | ServiceNow, Lansweeper | Export the issued laptops in scope and convert the export to the dated inventory JSON used below. Native APIs are planned. [Inventory file format](docs/laptop-audit.md#run-the-intune-audit) |
| Security monitoring (SIEM) | Splunk, Microsoft Sentinel | To forward collection-health alerts, configure `ALERT_WEBHOOK_URL` and `ALERT_WEBHOOK_SECRET` on the monitor. Your receiver must verify the signature and forward the event to your SIEM. Native Splunk and Sentinel connectors are planned. [Webhook setup](docs/read-only-pilot.md#deliver-transitions-to-an-approved-webhook) |

**Run an Intune laptop audit.** On the relay host, use Node.js 24 and supply a Microsoft Graph token in `INTUNE_ACCESS_TOKEN` with the read-only permission `DeviceManagementManagedDevices.Read.All`. Prepare an inventory with the export time, each issued laptop’s asset ID and its Entra device ID where known. From the repository root, run:

```sh
umask 077
node relay/laptop-audit.mjs /secure/issued-laptops.json > /secure/intune-review.json
```

Open the output JSON to review encryption, stale check-ins, missing matches and ambiguous identities. This check runs centrally. The connector has passed fixture tests; confirm its visible scope in your licensed tenant before relying on coverage. [Intune pilot guide](docs/laptop-audit.md#run-the-intune-audit)

**Install the IT collector for local evidence.** Enroll each laptop on the control plane with its own device ID and organization, for example `docker compose exec app node scripts/evidence.mjs enroll LAPTOP-104 payments`. Deliver only that device’s generated JSON through IT’s provisioning channel. For automatic uploads, set its `url` to your HTTPS endpoint ending in `/api/device`.

| Platform | Install under the intended IT-managed account | Evidence collected hourly |
|---|---|---|
| Windows | From the directory containing both collector PowerShell scripts, run `.\install-windows.ps1 -Config C:\Secure\device.json`. | Local Administrators membership and BitLocker protection on the OS volume |
| Linux | From the repository root, run `sh collectors/install-linux.sh /secure/device.json` in a systemd user session. | Local `sudo` and `wheel` membership |

Check the first signed bundle or upload receipt for the enrolled device. A macOS collector and machine-wide signed packages are planned. [Enrollment, verification and uninstall](docs/laptop-audit.md#install-the-endpoint-collector)

### Access reviews and other integrations

| Connection | How to connect today |
|---|---|
| HR and PostgreSQL | On the relay host, set `SOURCE_DATABASE_URL` to the read-only source connection and supply `CONTROL_URL` and `RELAY_TOKEN` for upload. Run `node relay/run.mjs /secure/hr-scope.json`, or supply an HR CSV followed by its scope JSON. Open **Operations** after the relay acknowledges the upload. [HR and database setup](docs/operator-guide.md#run-a-read-only-collection) |
| Saviynt | Create a read-only Analytics control, set `SAVIYNT_CONFIG` to the local mapping configuration and supply `SAVIYNT_TOKEN`. Run `node relay/access-report.mjs policy.json /secure/hr-scope.json` to include matching governance records in the report. The reader is fixture-tested; live tenant qualification is pending. [Required fields and upload instructions](docs/operator-guide.md#compare-saviynt-approvals-with-observed-access) |
| AWS IAM and GitHub | On the evidence host, configure ComplyOS database access and authenticate the relevant CLI. For sandbox IAM group membership, set `SANDBOX_ACCOUNT` and `SANDBOX_USER`, then run `node scripts/evidence.mjs aws`. For default-branch review settings, run `node scripts/evidence.mjs github OWNER/REPO` with permission to read branch protection. |
| Trivy and Prowler | On the evidence host, import an existing JSON scan with `node scripts/evidence.mjs trivy /secure/trivy.json` or `node scripts/evidence.mjs prowler /secure/prowler.json`. The evidence commands print a receipt ID. |
| AI model | Configure approved endpoints in `AI_ENDPOINTS` and model IDs in `AI_MODELS` on the app. In **AI Copilot**, select the provider and model, enter the key if required, and choose **Test connection**. [Model setup](docs/operator-guide.md#connect-your-own-model) |
| Enterprise operator sign-in | Configure the issuer, API audience, signing-key URL and operator memberships in `OIDC_CONFIG_FILE`, set `AUTH_MODE=oidc` and recreate the app. Browser sign-in also requires a configured login gateway. [OIDC and gateway setup](docs/operator-guide.md#use-an-enterprise-identity-provider-for-operator-apis) |

## Guides

- [Audit laptop encryption, check vendor coverage and install the IT collector](docs/laptop-audit.md)
- [Run a pilot and verify an access change](docs/read-only-pilot.md)
- [Check personal-data access against company policy](docs/operator-guide.md#review-access-against-a-company-sop)
- [Compare Saviynt governance records with database access](docs/operator-guide.md#compare-saviynt-approvals-with-observed-access)
- [Connect your own AI model](docs/operator-guide.md#connect-your-own-model)
- [Configure enterprise operator API authentication](docs/operator-guide.md#use-an-enterprise-identity-provider-for-operator-apis)
- [Operator guide, credentials and troubleshooting](docs/operator-guide.md)
- [System architecture](docs/complyos-2-system-design.md) · [Implementation checklist](docs/architecture-checklist.md)
