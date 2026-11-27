# Laptop audit and IT installation

## Connection inventory

Status refers to code shipped in this repository. Live vendor qualification requires credentials, licensing and a customer-approved scope.

| Category | Providers | Current coverage |
|---|---|---|
| MDM / UEM | Microsoft Intune, Jamf, Workspace ONE | Intune has a read-only, fixture-tested encryption audit. Jamf and Workspace ONE are planned. |
| Identity | Active Directory, Entra ID, Okta | Entra has an exact employee-ID lookup. The laptop audit matches the Entra device ID in Intune to the issued inventory. Native on-premises AD and Okta inventory are planned. OIDC operator sign-in is a separate integration. |
| EDR | CrowdStrike, Microsoft Defender for Endpoint, SentinelOne | Planned. Defender sensor health is a separate signal from BitLocker. |
| DLP | Microsoft Purview, Forcepoint | Planned. Proposed evidence includes policy assignment and enforcement outcome. |
| Remote management | Microsoft Configuration Manager, ManageEngine, Tanium | Planned. IT can use its own deployment tooling to distribute collectors today. |
| VPN / Zero Trust | Zscaler, GlobalProtect, Netskope | Planned. Proposed evidence includes posture verdict and protected application. |
| IT asset management | ServiceNow, Lansweeper | Supply a dated JSON inventory from an owner-reviewed export. Native APIs are planned. |
| SIEM | Splunk, Microsoft Sentinel | Native connectors are planned. The existing signed webhook delivers collection-health alerts to a configured receiver. |

Other enterprise connections include HR CSV/JSON, PostgreSQL grant checks, the Saviynt Analytics reader, scoped AWS IAM and GitHub CLI evidence, Trivy/Prowler report import and approved OpenAI-compatible model endpoints. The [operator guide](operator-guide.md) covers their configuration where available.

## Run the Intune audit

From the relay host use Node 24 and a Microsoft Graph token for the same tenant as the inventory. The read-only permission is `DeviceManagementManagedDevices.Read.All`. Confirm the token's visible scope and the tenant's Intune licensing. Supply `INTUNE_ACCESS_TOKEN` through the relay's secret manager. A laptop installation is optional for this API check.

Export the complete set of issued laptops in scope, including laptops absent from Intune. Use the directory **device ID** for matching, not the Entra object ID or Intune managed-device ID. A missing key is a valid input requiring review. Use the actual inventory observation time.

```json
{"observedAt":"2026-11-27T09:00:00Z","assets":[{"assetId":"IT-104","entraDeviceId":"84e8509d-482a-4793-a05c-ce431fd9ed10"}]}
```

```sh
umask 077
node relay/laptop-audit.mjs /secure/issued-laptops.json > /secure/intune-review.json
```

The local JSON report preserves one row per issued asset. Inventory and Intune device observations must be within the preceding 24 hours to count as current. Duplicate mappings require review. A failed page makes the collection unavailable. A missing match after a complete read means absent **within the credential's visible scope**. Intune's encryption flag is a management report; corroborating it with a local OS-volume observation is a separate check. Keep the inventory and report in the customer environment. This CLI does not upload them or take device actions.

## Install the endpoint collector

Use the endpoint collector when IT needs operating-system evidence from a specific device. The cloud relay and vendor tokens stay off employee laptops.

1. On the control-plane host, enroll each device once using `node scripts/evidence.mjs enroll LAPTOP-104 payments`. Use the same protected `DEVICE_KEYS_FILE` as the running app and set `DATA_DIR` for provisioning output. With Compose, `docker compose exec app node scripts/evidence.mjs enroll LAPTOP-104 payments` writes the enrollment inside the app's data volume. Enroll serially. Distribute only that device's generated JSON through IT's protected provisioning channel.
2. To upload automatically, add a `url` field with your HTTPS address ending in `/api/device` to the device JSON. Otherwise the collector writes a signed local bundle. Each enrollment uses its own HMAC key.
3. On Windows, place both PowerShell scripts together and run `.\install-windows.ps1 -Config C:\Secure\device.json` from their directory under the intended IT-managed account. The hourly scheduled task writes `%LOCALAPPDATA%\ComplyOS\latest.bundle`. It checks local Administrators membership and BitLocker protection of the OS volume. Missing permissions or an unavailable BitLocker cmdlet yield unknown evidence. The signed observation contains the protection verdict and excludes recovery keys.
4. On Linux, run `sh collectors/install-linux.sh /secure/device.json` in the intended account with a systemd user session. The hourly user timer collects sudo/wheel membership. This collector does not measure Linux disk encryption.
5. Check the initial bundle and upload receipt, confirm its device ID and observation time, and qualify the schedule across logout/reboot under your deployment account. Use `.\install-windows.ps1 -Uninstall` or `sh collectors/install-linux.sh uninstall` to remove scheduling and collector code. Remove retained device JSON and bundles through IT's retention procedure and remove the device's enrollment from the control-plane registry to revoke it.

Current installers are per-account scripts. Machine-wide signed packages, a managed Go agent, macOS collection, certificate rotation and fleet-wide updates remain planned.
