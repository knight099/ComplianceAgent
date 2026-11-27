"use client";

import { useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";
import { Metric, Panel, ResultBar } from "./ui/workspace";
import styles from "./ui/workspace.module.css";

export default function OverviewResults({ login }) {
  const [rows, setRows] = useState(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState("");
  const [request, setRequest] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/collection-health", {cache: "no-store", signal: controller.signal});
        if (!response.ok) {
          setNeedsLogin(response.status === 401);
          setError(response.status === 401 ? "Sign in with an operator credential to view results." : "Collection health is unavailable.");
          return;
        }
        const sources = await response.json();
        if (!controller.signal.aborted) setRows(sources);
      } catch {
        if (!controller.signal.aborted) setError("Collection health is unavailable.");
      }
    }
    load();
    return () => controller.abort();
  }, [request]);

  function refresh() {
    setRows(null);
    setError("");
    setRequest(value => value + 1);
  }

  if (error) return <Panel title="Overview unavailable"><p role="alert">{error}</p>{needsLogin && login && <a href={login}>Sign in with your organization</a>} <button onClick={refresh}>Try again</button></Panel>;
  if (!rows) return <p role="status">Loading collection health…</p>;

  const current = rows.filter(row => row.freshness === "Current");
  const total = key => current.reduce((sum, row) => sum + row[key], 0);
  const evaluated = total("evaluated");
  const retained = total("retained");
  const unknown = total("unknown");
  const attention = rows.filter(row => row.freshness !== "Current" || row.retained || row.unknown);
  return <>
    <div className={styles.overviewActions}>
      <p className={styles.subtitle}>Latest PostgreSQL offboarding checks by source</p>
      <button onClick={refresh}>Refresh</button>
    </div>
    {!rows.length ? <Panel title="No sources yet"><p>Enroll a relay or submit a collection to see results here.</p><a href="/operations">Open Operations →</a></Panel> : <>
      <div className={styles.metrics}>
        <Metric label="Sources with fresh data" value={current.length + " / " + rows.length} />
        <Metric label="Fresh access checks" value={evaluated} />
        <Metric label="Checks with retained access" value={evaluated ? retained : "—"} tone={retained ? "critical" : "neutral"} />
        <Metric label="Checks with unknown access" value={evaluated ? unknown : "—"} tone={unknown ? "warning" : "neutral"} />
      </div>
      <Panel title="Access check results">
        {evaluated ? <>
          <p>Each check covers one employee and one table in a source’s latest fresh assessment.</p>
          {[
            ["No scoped grant", total("no_scoped_grant"), "passing"],
            ["Retained access", retained, "critical"],
            ["Unknown", unknown, "unknown"],
          ].map(([label, count, tone]) => <ResultBar key={label} label={label + " (" + count + ")"} value={Math.round(count / evaluated * 100)} tone={tone} />)}
        </> : <p>No fresh employee and table checks are available.</p>}
      </Panel>
      <Panel title="Sources needing review">
        {attention.length ? attention.map(row => <div key={row.source} className={styles.incident}>
          <CircleAlert size={19} aria-hidden="true" data-tone={row.freshness === "Current" && row.retained ? "critical" : "warning"} />
          <div>{row.source}<span>{row.freshness === "Current" ? row.retained + " retained · " + row.unknown + " unknown" : row.freshness}</span></div>
        </div>) : <p>No sources flagged in this collection.</p>}
        <a href="/operations#health">Review collection health →</a>
      </Panel>
    </>}
  </>;
}
