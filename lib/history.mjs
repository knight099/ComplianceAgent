const day = 86400000;
const key = (row) => JSON.stringify([row.employee_id, row.resource]);
function completePaths(row) {
  const paths = row.evidence?.tableGrantPaths;
  if (
    row.evidence?.pathLimitReached !== false ||
    !Array.isArray(paths) ||
    !paths.every(
      (p) =>
        Array.isArray(p) && p.length && p.every((v) => typeof v === "string"),
    )
  )
    return null;
  return new Set(paths.map((p) => JSON.stringify(p)));
}
export function compareAssessments(before, after, now = Date.now()) {
  if (
    before.source !== after.source ||
    !(Date.parse(before.collected_at) < Date.parse(after.collected_at))
  )
    throw Error(
      "Choose two assessments from the same source in chronological order.",
    );
  const age = now - Date.parse(after.collected_at);
  const earlier = new Map(before.results.map((r) => [key(r), r])),
    later = new Map(after.results.map((r) => [key(r), r]));
  const changes = [];
  for (const id of new Set([...earlier.keys(), ...later.keys()])) {
    const a = earlier.get(id),
      b = later.get(id);
    const row = {
      employee: (a || b).employee_id,
      resource: (a || b).resource,
      before: a || null,
      after: b || null,
    };
    if (!a || !b)
      row.reason = "Check absent from " + (a ? "later" : "earlier") + " scope";
    else if (age < 0 || age > day)
      row.reason = "Later collection is outside the freshness window";
    else if (before.policy_version !== after.policy_version)
      row.reason = "Policy version changed";
    else if (!a.role_name || a.role_name !== b.role_name)
      row.reason = "Identity mapping changed or unavailable";
    else if (a.decision === "UNKNOWN" || b.decision === "UNKNOWN")
      row.reason = "Incomplete collection evidence";
    if (row.reason) row.outcome = "Unverified";
    else {
      if (b.decision === "RETAINED")
        row.outcome =
          a.decision === "RETAINED"
            ? "Access retained"
            : "Newly observed access";
      else
        row.outcome =
          a.decision === "RETAINED"
            ? "Verified no scoped grant"
            : "No scoped grant in either assessment";
      const old = completePaths(a),
        recent = completePaths(b);
      if (old && recent) {
        row.removed = [...old]
          .filter((p) => !recent.has(p))
          .map((p) => JSON.parse(p));
        row.added = [...recent]
          .filter((p) => !old.has(p))
          .map((p) => JSON.parse(p));
        row.remaining = [...recent]
          .filter((p) => old.has(p))
          .map((p) => JSON.parse(p));
      }
    }
    changes.push(row);
  }
  return {
    source: after.source,
    before: { id: before.id, collected: before.collected_at },
    after: { id: after.id, collected: after.collected_at },
    reviewedAt: new Date(now).toISOString(),
    changes,
  };
}
