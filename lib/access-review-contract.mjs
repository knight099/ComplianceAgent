import { accessOutcome } from "../policies/access-review/v1/semantics.mjs";
export { accessOutcome };
import { accessRule, accessRevision } from "./opa-access-review.mjs";
import { validateGovernance } from "../connectors/saviynt/index.mjs";
import { validateResultObservations } from "../packages/connector-sdk/observations.mjs";

const text = value => typeof value === "string" && value.trim().length > 0;
const dated = value => text(value) && Number.isFinite(Date.parse(value));
const nullableText = value => value === null || text(value);
const fail = () => { throw Error("Invalid access review"); };

export function validateAccessReport(report) {
  if (report?.format !== "complyos.access-review/v1" ||
      ![report.source, report.hrRevision, report.policy?.id, report.policy?.version,
        report.policy?.reference, report.policy?.reviewer].every(text) ||
      ![report.hrObserved, report.observedAt].every(dated) || !Array.isArray(report.rows)) fail();
  if (report.saviynt !== undefined && (!text(report.saviynt?.analyticsName) || !dated(report.saviynt?.observedAt) ||
      !["observed", "unavailable"].includes(report.saviynt?.coverage))) fail();
  if (report.evaluator !== undefined && (report.evaluator?.engine !== "opa" ||
      report.evaluator.rule !== accessRule || report.evaluator.revision !== accessRevision)) fail();
  const seen = new Set();
  for (const row of report.rows) {
    if (!text(row?.employeeId) || typeof row.databaseRole !== "string" ||
        ![row.businessRole, row.classification].every(nullableText) ||
        !Array.isArray(row.resource) || row.resource.length !== 2 || !row.resource.every(text) ||
        ![row.expected, row.observed].every(v => [null, "none", "read"].includes(v))) fail();
    validateGovernance(report, row);
    const key = JSON.stringify([row.employeeId, row.resource]);
    if (seen.has(key)) fail();
    seen.add(key);
    const e = row.evidence;
    if (e?.hrObserved !== report.hrObserved || e.hrRevision !== report.hrRevision ||
        e.schema !== row.resource[0] || e.table !== row.resource[1] ||
        (row.expected !== null && !row.classification)) fail();
    const decision = row.observed === null ? "UNKNOWN" : row.observed === "read" ? "RETAINED" : "NO_SCOPED_GRANT";
    validateResultObservations(e.observations, { employeeId: row.employeeId, evidence: e, decision,
      resource: JSON.stringify(row.resource) }, report.source);
    if (row.exception !== null) {
      const x = row.exception;
      if (!x || x.employeeId !== row.employeeId || x.businessRole !== row.businessRole ||
          JSON.stringify(x.resource) !== JSON.stringify(row.resource) || !text(x.approver) || !text(x.reference) ||
          e.employment !== "active" || row.expected !== "none" || !dated(x.from) || !dated(x.until) ||
          Date.parse(x.from) > Date.parse(report.observedAt) || Date.parse(x.until) <= Date.parse(report.observedAt)) fail();
    }
    const outcome = accessOutcome(row.expected, row.observed, row.exception);
    if (outcome !== row.outcome) fail();
  }
}
