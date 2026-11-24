// Compare an owner's baseline with a single immutable assessment snapshot.
export function reconcile(run, baseline, now = Date.now()) {
  if (
    baseline?.source !== run.source ||
    !Array.isArray(baseline.checks) ||
    !baseline.checks.length
  )
    throw Error("Choose a nonempty baseline for this source.");
  const collected = Date.parse(run.collected_at);
  const fresh =
    Number.isFinite(collected) &&
    now >= collected &&
    now - collected <= 86400000;
  const rows = new Map();
  const key = (employee, resource) => JSON.stringify([employee, resource]);
  for (const check of baseline.checks) {
    if (
      typeof check?.employeeId !== "string" ||
      !check.employeeId.trim() ||
      !Array.isArray(check.resource) ||
      check.resource.length !== 2 ||
      !check.resource.every((s) => typeof s === "string" && s.trim()) ||
      !["RETAINED", "NO_SCOPED_GRANT"].includes(check.expected)
    )
      throw Error("Invalid baseline check.");
    const id = key(check.employeeId, JSON.stringify(check.resource));
    if (rows.has(id))
      throw Error("Duplicate employee and resource in baseline.");
    if (
      check.revokedAt !== undefined &&
      (check.expected !== "NO_SCOPED_GRANT" ||
        !Number.isFinite(Date.parse(check.revokedAt)))
    )
      throw Error("Invalid revocation timestamp.");
    rows.set(id, { ...check, observed: null, outcome: "MISSING_OBSERVATION" });
  }
  const unresolved = new Set();
  let failedChecks = 0;
  for (const result of run.results) {
    const id = key(result.employee_id, result.resource);
    const row = rows.get(id) || {
      employeeId: result.employee_id,
      resource: JSON.parse(result.resource),
      expected: null,
    };
    row.observed = result.decision;
    row.reason = result.evidence?.reason || null;
    if (row.reason === "Missing or ambiguous identity mapping")
      unresolved.add(row.employeeId);
    if (row.reason === "PostgreSQL collection failed") failedChecks++;
    if (!row.expected) row.outcome = "MISSING_BASELINE";
    else if (
      !fresh ||
      row.observed === "UNKNOWN" ||
      (row.revokedAt && collected <= Date.parse(row.revokedAt))
    )
      row.outcome = "UNVERIFIED";
    else row.outcome = row.expected === row.observed ? "AGREES" : "DISAGREES";
    if (row.revokedAt && row.outcome === "AGREES")
      row.verificationDelaySeconds =
        (collected - Date.parse(row.revokedAt)) / 1000;
    rows.set(id, row);
  }
  const checks = [...rows.values()],
    counts = {};
  for (const row of checks)
    counts[row.outcome] = (counts[row.outcome] || 0) + 1;
  return {
    assessmentId: run.id,
    source: run.source,
    collectedAt: run.collected_at,
    reviewedAt: new Date(now).toISOString(),
    fresh,
    counts,
    unresolvedEmployees: unresolved.size,
    failedChecks,
    checks,
  };
}
