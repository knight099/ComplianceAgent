import { assess } from "../../relay/offboarding.mjs";
import { parseAssessment } from "../../packages/connector-sdk/contract.mjs";
export function postgresConnector(query) {
  return {
    id: "postgres",
    capabilities: [
      "catalog.select-privileges",
      "catalog.role-membership-paths",
    ],
    async collect(scope, now) {
      return parseAssessment(await assess(scope, query, now));
    },
  };
}
