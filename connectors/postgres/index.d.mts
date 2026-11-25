import type {
  PostgresOffboardingScope,
  ReadOnlyConnector,
} from "../../packages/connector-sdk/types";
type CatalogQuery = (
  sql: string,
  parameters: string[],
) => Promise<{ rows: Record<string, unknown>[] }>;
export function postgresConnector(
  query: CatalogQuery,
  directory?: ReadonlyMap<string, {
    source: string;
    observed: string;
    status: "matched" | "unavailable" | "unmatched" | "ambiguous";
    accountId?: string;
  }>,
): ReadOnlyConnector<PostgresOffboardingScope>;
