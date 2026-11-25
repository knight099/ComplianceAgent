export interface AccessObservation {
  employeeId: string;
  role: string;
  resource: string;
  decision: "RETAINED" | "NO_SCOPED_GRANT" | "UNKNOWN";
  evidence: Record<string, unknown>;
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
