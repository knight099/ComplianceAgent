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

## Guides

- [Audit laptop encryption, check vendor coverage and install the IT collector](docs/laptop-audit.md)
- [Run a pilot and verify an access change](docs/read-only-pilot.md)
- [Check personal-data access against company policy](docs/operator-guide.md#review-access-against-a-company-sop)
- [Compare Saviynt governance records with database access](docs/operator-guide.md#compare-saviynt-approvals-with-observed-access)
- [Connect your own AI model](docs/operator-guide.md#connect-your-own-model)
- [Configure enterprise operator API authentication](docs/operator-guide.md#use-an-enterprise-identity-provider-for-operator-apis)
- [Operator guide, credentials and troubleshooting](docs/operator-guide.md)
- [System architecture](docs/complyos-2-system-design.md) · [Implementation checklist](docs/architecture-checklist.md)
