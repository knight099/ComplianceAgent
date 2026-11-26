import { createHash } from "node:crypto";

function recordOwner(index, account, employee) {
  if (!account) return;
  if (!index.has(account)) index.set(account, new Set());
  index.get(account).add(employee);
}

// The organization comes from the authenticated read. The source names the
// relay's assessment scope, which also bounds the employee ID namespace.
export function assessmentIdentities(organization, source, results) {
  const employees = new Map(), roleOwners = new Map(), accountOwners = new Map();
  for (const row of results) {
    const employee = row.employee_id;
    if (!employees.has(employee)) employees.set(employee, []);
    employees.get(employee).push(row);
    recordOwner(roleOwners, row.role_name, employee);
    recordOwner(accountOwners, row.evidence?.directory?.accountId, employee);
  }
  return Array.from(employees, ([employee, rows]) => {
    const key = createHash("sha256").update(JSON.stringify([organization, source, employee])).digest("hex");
    const links = [], review = new Set();
    const hr = new Map(), directory = new Map(), roles = new Set();
    let catalogRow;
    for (const row of rows) {
      const evidence = row.evidence ?? {};
      roles.add(row.role_name);
      const observations = Array.isArray(evidence.observations) ? evidence.observations : [];
      const observation = kind => observations.find(o => o.kind === kind && o.subject === employee);
      const employment = observation("hr.employment");
      if (employment?.coverage === "observed") {
        hr.set(JSON.stringify([employment.source, employment.observedAt, employment.value]), employment);
      } else review.add("Fresh HR identity evidence missing");
      const entra = observation("entra.employee-id");
      if (entra?.value === "matched" && evidence.directory?.accountId === entra.target) {
        directory.set(entra.target, entra);
      } else if (entra || evidence.directory) review.add("Entra identity needs review");
      const postgres = observation("postgres.catalog-select");
      if (["observed", "partial"].includes(postgres?.coverage)) catalogRow = postgres;
    }
    if (hr.size > 1) review.add("Conflicting HR records");
    if (hr.size === 1 && !review.has("Fresh HR identity evidence missing")) {
      const [record] = hr.values();
      links.push({ system: "HR", account: employee, source: record.source, observedAt: record.observedAt });
      if (directory.size) {
        const [account, match] = directory.entries().next().value;
        if (directory.size === 1 && accountOwners.get(account)?.size === 1 && !review.has("Entra identity needs review") &&
            rows.every(row => row.evidence?.directory?.accountId === account))
          links.push({ system: "Entra ID", account, source: match.source, observedAt: match.observedAt });
        else review.add("Conflicting Entra account mapping");
      }
      const [role] = roles;
      if (roles.size === 1 && role && roleOwners.get(role)?.size === 1 && catalogRow)
        links.push({ system: "PostgreSQL", account: role, source: record.source + " (role mapping), " + source + " (catalog)", observedAt: catalogRow.observedAt });
      else review.add("Database role mapping unconfirmed");
    }
    return { key, employee, links, review: [...review] };
  });
}
