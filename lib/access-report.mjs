import { collectReadPrivileges } from "../relay/offboarding.mjs";

const text = (value) => typeof value === "string" && Boolean(value.trim());
const datasetKey = (resource) => JSON.stringify(resource);
const pair = (subject, resource) => JSON.stringify([subject, resource]);

function indexPolicy(policy, source, now) {
  if (policy?.source !== source || ![policy?.id, policy?.version, policy?.reviewer,
    policy?.reference].every(text) || !Array.isArray(policy.datasets) ||
    !Array.isArray(policy.exceptions ?? [])) throw Error("Invalid reviewed policy or source");
  const datasets = new Map();
  for (const dataset of policy.datasets) {
    if (!Array.isArray(dataset?.resource) || dataset.resource.length !== 2 ||
        !dataset.resource.every(text) || !text(dataset.classification) ||
        !dataset.roles || typeof dataset.roles !== "object" || Array.isArray(dataset.roles) ||
        Object.entries(dataset.roles).some(([role, permission]) =>
          !text(role) || !["read", "none"].includes(permission)))
      throw Error("Invalid dataset policy");
    const key = datasetKey(dataset.resource);
    if (datasets.has(key)) throw Error("Duplicate dataset policy");
    datasets.set(key, dataset);
  }
  const exceptions = new Map();
  for (const entry of policy.exceptions ?? []) {
    const from = Date.parse(entry?.from), until = Date.parse(entry?.until);
    if (!datasets.has(datasetKey(entry?.resource)) ||
        ![entry?.employeeId, entry?.businessRole, entry?.reference, entry?.approver].every(text) ||
        !Number.isFinite(from) || !Number.isFinite(until) || from >= until)
      throw Error("Invalid read exception");
    if (from > now || until <= now) continue;
    const key = pair([entry.employeeId, entry.businessRole], entry.resource);
    if (exceptions.has(key)) throw Error("Overlapping read exceptions");
    exceptions.set(key, entry);
  }
  return { datasets, exceptions };
}

export async function buildAccessReport(feed, policy, query, now = new Date(), directory) {
  const { datasets, exceptions } = indexPolicy(policy, feed.source, now.getTime());
  const observations = await collectReadPrivileges(feed, query, now, directory);
  const people = new Map(feed.employees.map(employee => [employee.id, employee]));
  const rows = observations.map(({ employeeId, role, resource, decision, evidence }) => {
    const person = people.get(employeeId);
    const dataset = datasets.get(resource);
    const businessRole = text(person.businessRole) ? person.businessRole : null;
    let expected = null;
    let exception = null;
    if (dataset && person.status === "terminated") expected = "none";
    else if (dataset && businessRole && Object.hasOwn(dataset.roles, businessRole)) {
      expected = dataset.roles[businessRole];
      if (expected === "none") exception = exceptions.get(pair([employeeId, businessRole], dataset.resource)) ?? null;
    }
    const observed = { RETAINED: "read", NO_SCOPED_GRANT: "none", UNKNOWN: null }[decision];
    let outcome = "INSUFFICIENT_EVIDENCE";
    if (observed !== null && expected !== null) {
      if (observed === expected) outcome = "AS_EXPECTED";
      else if (observed === "none") outcome = "MISSING_EXPECTED_GRANT";
      else outcome = exception ? "APPROVED_EXCEPTION" : "EXCESS_ACCESS";
    }
    return { employeeId, databaseRole: role, businessRole, resource: JSON.parse(resource),
      classification: dataset?.classification ?? null, observed, expected, exception, outcome, evidence };
  });
  return {
    format: "complyos.access-review/v1", source: feed.source, observedAt: now.toISOString(),
    hrRevision: feed.hrRevision, hrObserved: feed.hrObserved,
    policy: { id: policy.id, version: policy.version, reviewer: policy.reviewer, reference: policy.reference },
    rows,
  };
}
