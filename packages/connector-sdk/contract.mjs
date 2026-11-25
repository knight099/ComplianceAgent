export const contractVersion = "complyos.assessment/v1";
export const postgresPolicy = "hr.postgres.offboarding/v1";
export function parseAssessment(input) {
  const text = (x) => typeof x === "string";
  if (
    !input ||
    (input.contractVersion !== undefined &&
      input.contractVersion !== contractVersion) ||
    !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(input.id) ||
    input.policy !== postgresPolicy ||
    !text(input.source) ||
    !input.source.trim() ||
    !text(input.observed) ||
    !Number.isFinite(Date.parse(input.observed)) ||
    !Array.isArray(input.results)
  )
    throw Error("Invalid assessment envelope");
  const seen = new Set();
  for (const r of input.results) {
    if (
      !r ||
      !text(r.employeeId) ||
      !text(r.role) ||
      !text(r.resource) ||
      !["RETAINED", "NO_SCOPED_GRANT", "UNKNOWN"].includes(r.decision) ||
      !r.evidence ||
      typeof r.evidence !== "object" ||
      Array.isArray(r.evidence)
    )
      throw Error("Invalid observation");
    const key = JSON.stringify([r.employeeId, r.resource]);
    if (seen.has(key)) throw Error("Duplicate observation");
    seen.add(key);
  }
  return { ...input, contractVersion };
}
