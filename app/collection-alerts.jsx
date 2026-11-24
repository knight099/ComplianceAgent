"use client";
import { useEffect, useState } from "react";
export default function CollectionAlerts({ runs }) {
  const [data, set] = useState(null),
    [error, fail] = useState(false);
  useEffect(() => {
    if (!runs) return;
    const controller = new AbortController();
    async function load() {
      try {
        const r = await fetch("/api/collection-alerts", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!r.ok) throw Error();
        const value = await r.json();
        if (!controller.signal.aborted) {
          set(value);
          fail(false);
        }
      } catch {
        if (!controller.signal.aborted) fail(true);
      }
    }
    load();
    const timer = setInterval(load, 60000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [runs]);
  if (error) return <p role="alert">Collection alert status unavailable.</p>;
  if (!data) return null;
  return (
    <article>
      <h2>Collection alerts</h2>
      <p>
        {data.checked_at
          ? "Last successful check: " +
            new Date(data.checked_at).toLocaleString()
          : "Awaiting the first monitor check."}
      </p>
      {data.checked_at && Date.now() - Date.parse(data.checked_at) > 180000 && (
        <p role="alert">Monitor checks are overdue.</p>
      )}
      {data.open.map((a) => (
        <p key={a.id}>
          <strong>{a.source}</strong> · {a.detail} · Opened{" "}
          {new Date(a.opened_at).toLocaleString()}
        </p>
      ))}
      {data.checked_at && !data.open.length && (
        <p>No open alerts at the last check.</p>
      )}
      {data.recent.length > 0 && (
        <details>
          <summary>Recent recoveries</summary>
          {data.recent.map((a) => (
            <p key={a.id}>
              {a.source} · {a.detail} · Resolved{" "}
              {new Date(a.resolved_at).toLocaleString()} · Assessment{" "}
              {a.recovery_assessment}
            </p>
          ))}
        </details>
      )}
    </article>
  );
}
