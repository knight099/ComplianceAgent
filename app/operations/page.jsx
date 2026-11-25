"use client";
import { useEffect, useState } from "react";
import PilotReview from "../pilot-review";
import CollectionHealth from "../collection-health";
import CollectionAlerts from "../collection-alerts";
import AssessmentHistory from "../assessment-history";
import ModelConnection from "../model-connection";
export default function Page() {
  const [runs, setRuns] = useState(null),
    [error, setError] = useState("");
  async function load() {
    try {
      const r = await fetch("/api/v1/assessments", { cache: "no-store" });
      if (!r.ok) throw Error("Access review unavailable (" + r.status + ").");
      setRuns(await r.json());
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <main>
      <header>
        <a href="/">ComplyOS</a> / Control assurance<button onClick={load}>Refresh</button>
      </header>
      <section className="title">
        <h1>Offboarding assurance</h1>
      </section>
      <p>
        Review PostgreSQL read privileges associated with terminated employees.
      </p>
      <div id="alerts"><CollectionAlerts runs={runs} /></div>
      <div id="health"><CollectionHealth runs={runs} /></div>
      <div id="model"><ModelConnection runs={runs} /></div>
      {error && <p role="alert">{error}</p>}
      {runs?.length === 0 && (
        <article>
          <h3>Awaiting the first assessment</h3>
          <p>
            Submit a scoped HR and database assessment from an enrolled relay.
          </p>
        </article>
      )}
      {runs?.map((a) => (
        <article key={a.id}>
          <h2>{a.source}</h2>
          <p>
            {a.policy_version} · Submitted by {a.submitted_by || "Unrecorded"} ·
            Collected {new Date(a.collected_at).toLocaleString()} ·{" "}
            {Date.parse(a.collected_at) > Date.now()
              ? "Future timestamp"
              : Date.now() - Date.parse(a.collected_at) > 86400000
                ? "Stale evidence"
                : "Within 24-hour window"}
          </p>
          <PilotReview run={a} />
          <AssessmentHistory source={a.source} />
          {!a.results.length && (
            <p>No terminated employees in the submitted scope.</p>
          )}
          {a.results.map((r) => (
            <details key={JSON.stringify([r.employee_id, r.resource])}>
              <summary>
                {r.employee_id} · {r.resource} · {r.decision}
              </summary>
              <p>Mapped database role: {r.role_name || "Unknown"}</p>
              {Array.isArray(r.projected_paths) &&
                r.projected_paths.every(
                  (path) =>
                    Array.isArray(path) &&
                    path.every((role) => typeof role === "string"),
                ) &&
                typeof r.evidence.schema === "string" &&
                typeof r.evidence.table === "string" &&
                r.decision === "RETAINED" && (
                  <section>
                    <h3>Table SELECT grant paths</h3>
                    {r.projected_paths.length ? (
                      <ul>
                        {r.projected_paths.map((path) => (
                          <li key={JSON.stringify(path)}>
                            {path.join(" → ")} → {r.evidence.schema}.
                            {r.evidence.table}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>
                        PostgreSQL reported a readable role. No table-level
                        grant path was recorded.
                      </p>
                    )}
                    {r.evidence.pathLimitReached && (
                      <p>
                        Traversal limit reached. Additional paths may exist.
                      </p>
                    )}
                  </section>
                )}
              <pre>{JSON.stringify(r.evidence, null, 2)}</pre>
            </details>
          ))}
        </article>
      ))}
    </main>
  );
}
