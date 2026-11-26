// Each kind names the specific question answered by its provider.
export const observationVersion = "complyos.observation/v1";
const outcomes = {
  "hr.employment": { observed: ["active", "terminated"], stale: ["active", "terminated"], "future-dated": ["active", "terminated"] },
  "entra.employee-id": { observed: ["matched", "unmatched", "ambiguous"], unavailable: [null] },
  "postgres.catalog-select": {
    observed: ["RETAINED", "NO_SCOPED_GRANT"],
    partial: ["RETAINED", "NO_SCOPED_GRANT"],
    unavailable: [null],
    skipped: [null],
  },
};

export function parseSourceObservation(record) {
  const allowed = record && typeof record.kind === "string" && Object.hasOwn(outcomes, record.kind) && outcomes[record.kind];
  if (!allowed || record.version !== observationVersion ||
      typeof record.coverage !== "string" || !Object.hasOwn(allowed, record.coverage) || !allowed[record.coverage].includes(record.value) ||
      [record.source, record.subject, record.target].some(field => typeof field !== "string" || !field.trim()))
    throw Error("Invalid source observation");
  const validTime = typeof record.observedAt === "string" && Number.isFinite(Date.parse(record.observedAt));
  const missingDirectoryTime = record.kind === "entra.employee-id" && record.coverage === "unavailable" && record.observedAt === null;
  if (record.coverage === "skipped" ? record.observedAt !== null : !validTime && !missingDirectoryTime)
    throw Error("Invalid observation time");
  return record;
}

export function validateResultObservations(records, result, source) {
  if (!Array.isArray(records)) throw Error("Invalid source observations");
  const kinds = new Set();
  for (const raw of records) {
    const record = parseSourceObservation(raw);
    if (kinds.has(record.kind) || record.subject !== result.employeeId)
      throw Error("Conflicting observation subject or kind");
    kinds.add(record.kind);
    if (record.kind === "hr.employment" &&
        (record.target !== result.employeeId || record.value !== result.evidence.employment ||
         record.source !== result.evidence.hrRevision || record.observedAt !== result.evidence.hrObserved ||
         (record.coverage !== "observed" && result.decision !== "UNKNOWN")))
      throw Error("Conflicting HR observation");
    if (record.kind === "entra.employee-id") {
      const directory = result.evidence.directory;
      const status = directory?.status ?? "unavailable";
      if ((record.value ?? "unavailable") !== status || record.observedAt !== (directory?.observed ?? null) ||
          record.target !== (directory?.accountId ?? result.employeeId) ||
          (status !== "matched" && result.decision !== "UNKNOWN"))
        throw Error("Conflicting directory observation");
    }
    if (record.kind === "postgres.catalog-select" &&
        (record.source !== source || record.target !== result.resource ||
        (record.value ?? "UNKNOWN") !== result.decision))
      throw Error("Conflicting PostgreSQL observation");
  }
  if (result.evidence.directory && !kinds.has("entra.employee-id")) throw Error("Missing directory observation");
  if (!kinds.has("hr.employment") || !kinds.has("postgres.catalog-select"))
    throw Error("Missing required source observation");
}
