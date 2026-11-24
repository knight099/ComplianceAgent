"use client";
import { useEffect, useState } from "react";
export default function CollectionHealth({ runs }) {
  const [sources, setSources] = useState(null),
    [error, setError] = useState(false);
  useEffect(() => {
    if (!runs) return;
    const controller = new AbortController();
    fetch("/api/collection-health", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw Error();
        return res.json();
      })
      .then((rows) => {
        if (!controller.signal.aborted) {
          setSources(rows);
          setError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSources(null);
          setError(true);
        }
      });
    return () => controller.abort();
  }, [runs]);
  if (error)
    return <p role="alert">Collection health unavailable. Refresh to retry.</p>;
  if (!sources?.length) return null;
  return (
    <article>
      <h2>Collection health</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              {[
                "Source",
                "Collection status",
                "Collected",
                "Received",
                "Checks",
                "Unknown",
                "Database failures",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.source}>
                <td>{s.source}</td>
                <td>{s.freshness}</td>
                <td>
                  {s.collected_at
                    ? new Date(s.collected_at).toLocaleString()
                    : "—"}
                </td>
                <td>
                  {s.received_at
                    ? new Date(s.received_at).toLocaleString()
                    : "—"}
                </td>
                <td>{s.evaluated ?? "—"}</td>
                <td>{s.unknown ?? "—"}</td>
                <td>{s.failed ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Database failures are included in unknown checks. Collection status uses
        the latest observation time.
      </p>
    </article>
  );
}
