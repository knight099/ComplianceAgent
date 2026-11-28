// Historical replay depends on these v1 semantics. Add a new revision for behavior changes.
const text = (value) => typeof value === "string" && Boolean(value.trim());
const datasetKey = (resource) => JSON.stringify(resource);
const pair = (subject, resource) => JSON.stringify([subject, resource]);

export function indexPolicy(policy, source, now) {
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

export function policyExpectation({ datasets, exceptions }, employeeId, businessRole, employment, resource) {
  const dataset = datasets.get(resource);
  let expected = null;
  let exception = null;
  if (dataset && employment === "terminated") expected = "none";
  else if (dataset && businessRole && Object.hasOwn(dataset.roles, businessRole)) {
    expected = dataset.roles[businessRole];
    if (expected === "none") exception = exceptions.get(pair([employeeId, businessRole], dataset.resource)) ?? null;
  }
  return { expected, exception, classification: dataset?.classification ?? null };
}

export function accessOutcome(expected, observed, exception) {
  if (observed === null || expected === null) return "INSUFFICIENT_EVIDENCE";
  if (observed === expected) return "AS_EXPECTED";
  if (observed === "none") return "MISSING_EXPECTED_GRANT";
  return exception ? "APPROVED_EXCEPTION" : "EXCESS_ACCESS";
}
