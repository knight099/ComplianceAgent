type Outcome<C extends string, V> = { coverage: C; value: V };
export type SourceObservation = {
  version: "complyos.observation/v1";
  source: string;
  subject: string;
  target: string;
} & (
  | ({ kind: "hr.employment"; observedAt: string } & Outcome<"observed" | "stale" | "future-dated", "active" | "terminated">)
  | ({ kind: "entra.employee-id" } &
      (({ observedAt: string } & Outcome<"observed", "matched" | "unmatched" | "ambiguous">) | ({ observedAt: string | null } & Outcome<"unavailable", null>)))
  | ({ kind: "postgres.catalog-select" } & (
      | ({ observedAt: string } & Outcome<"observed" | "partial", "RETAINED" | "NO_SCOPED_GRANT">)
      | ({ observedAt: string } & Outcome<"unavailable", null>)
      | ({ observedAt: null } & Outcome<"skipped", null>)
    ))
);
export interface AccessObservation {
  employeeId: string;
  role: string;
  resource: string;
  decision: "RETAINED" | "NO_SCOPED_GRANT" | "UNKNOWN";
  evidence: Record<string, unknown> & { observations?: SourceObservation[] };
}
export interface AssessmentBatch {
  contractVersion: "complyos.assessment/v1";
  id: string;
  source: string;
  observed: string;
  policy: string;
  results: AccessObservation[];
}
export interface ReadOnlyConnector<Scope> {
  readonly id: string;
  readonly capabilities: readonly string[];
  collect(scope: Scope, now?: Date): Promise<AssessmentBatch>;
}
export interface PostgresOffboardingScope {
  source: string;
  hrRevision: string;
  hrObserved: string;
  employees: {
    id: string;
    role?: string | null;
    status: "active" | "terminated";
  }[];
  resources: [string, string][];
}
