import { accessOutcome } from "./access-review-contract.mjs";
import { collectReadPrivileges } from "../relay/offboarding.mjs";

import { indexPolicy, policyExpectation } from "../policies/access-review/v1/semantics.mjs";

export async function buildAccessReport(feed, policy, query, now = new Date(), directory) {
  const indexed = indexPolicy(policy, feed.source, now.getTime());
  const observations = await collectReadPrivileges(feed, query, now, directory);
  const people = new Map(feed.employees.map(employee => [employee.id, employee]));
  const rows = observations.map(({ employeeId, role, resource, decision, evidence }) => {
    const person = people.get(employeeId);
    const businessRole = (typeof person.businessRole === "string" && person.businessRole.trim()) ? person.businessRole : null;
    const { expected, exception, classification } = policyExpectation(indexed, employeeId, businessRole, person.status, resource);
    const observed = { RETAINED: "read", NO_SCOPED_GRANT: "none", UNKNOWN: null }[decision];
    const outcome = accessOutcome(expected, observed, exception);
    return { employeeId, databaseRole: role, businessRole, resource: JSON.parse(resource),
      classification, observed, expected, exception, outcome, evidence };
  });
  return {
    format: "complyos.access-review/v1", source: feed.source, observedAt: now.toISOString(),
    hrRevision: feed.hrRevision, hrObserved: feed.hrObserved,
    policy: { id: policy.id, version: policy.version, reviewer: policy.reviewer, reference: policy.reference },
    rows,
  };
}
