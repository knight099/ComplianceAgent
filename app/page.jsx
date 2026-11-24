"use client";
import { useEffect, useState } from "react";
import ModelConnection from "./model-connection";
export default function Page() {
  const [runs, setRuns] = useState(null),
    [error, setError] = useState("");
  async function load() {
    try {
      const r = await fetch("/api/assessments", { cache: "no-store" });
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
        ComplyOS / Control assurance<button onClick={load}>Refresh</button>
      </header>
      <section className="title">
        <h1>Offboarding assurance</h1>
      </section>
      <p>
        Review PostgreSQL read privileges associated with terminated employees.
      </p>
      <ModelConnection runs={runs} />
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
            {a.policy_version} · Collected{" "}
            {new Date(a.collected_at).toLocaleString()} ·{" "}
            {Date.now() - Date.parse(a.collected_at) > 86400000
              ? "Stale evidence"
              : "Within 24-hour window"}
          </p>
          {!a.results.length && (
            <p>No terminated employees in the submitted scope.</p>
          )}
          {a.results.map((r) => (
            <details key={JSON.stringify([r.employee_id, r.resource])}>
              <summary>
                {r.employee_id} · {r.resource} · {r.decision}
              </summary>
              <p>Mapped database role: {r.role_name || "Unknown"}</p>
              <pre>{JSON.stringify(r.evidence, null, 2)}</pre>
            </details>
          ))}
        </article>
      ))}
    </main>
  );
}
