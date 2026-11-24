"use client";
import { useState } from "react";
export default function AssessmentHistory({ source }) {
  const [runs, list] = useState(null),
    [before, start] = useState(""),
    [after, end] = useState(""),
    [report, show] = useState(null),
    [error, fail] = useState(""),
    [busy, lock] = useState(false);
  async function request(compare) {
    lock(true);
    fail("");
    show(null);
    try {
      const q = new URLSearchParams({
        source,
        ...(compare ? { before, after } : {}),
      });
      const res = await fetch("/api/history?" + q, { cache: "no-store" });
      if (!res.ok)
        throw Error((await res.json()).error || "History unavailable");
      const data = await res.json();
      if (compare) show(data);
      else {
        list(data);
        end(data[0]?.id || "");
        start(
          data.find(
            (r) =>
              Date.parse(r.collected_at) < Date.parse(data[0].collected_at),
          )?.id || "",
        );
      }
    } catch (e) {
      fail(e.message);
    } finally {
      lock(false);
    }
  }
  return (
    <details
      onToggle={(e) => {
        if (e.currentTarget.open && !runs && !busy) request(false);
      }}
    >
      <summary>Compare assessments</summary>
      {runs?.length >= 2 && (
        <fieldset disabled={busy} onChange={() => show(null)}>
          {[
            ["Earlier", before, start],
            ["Later", after, end],
          ].map(([label, value, set]) => (
            <label key={label}>
              {label} collection{" "}
              <select value={value} onChange={(e) => set(e.target.value)}>
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.collected_at} · {r.id}
                  </option>
                ))}
              </select>{" "}
            </label>
          ))}
          <button
            disabled={!before || !after || before === after}
            onClick={() => request(true)}
          >
            Compare
          </button>
        </fieldset>
      )}
      {runs && runs.length < 2 && (
        <p>A second collection for this source is needed.</p>
      )}
      {error && (
        <p role="alert">
          {error}{" "}
          <button disabled={busy} onClick={() => request(false)}>
            Reload history
          </button>
        </p>
      )}
      {report && (
        <section>
          <p>
            Earlier: {report.before.id} · {report.before.collected}
            <br />
            Later: {report.after.id} · {report.after.collected}
            <br />
            Reviewed: {report.reviewedAt}
          </p>
          {!report.changes.length && (
            <p>Neither assessment contained checks.</p>
          )}
          {report.changes.map((row) => (
            <details key={JSON.stringify([row.employee, row.resource])}>
              <summary>
                {row.employee} · {row.resource} · {row.outcome}
              </summary>
              {row.reason && <p>{row.reason}</p>}
              {row.removed
                ? ["removed", "added", "remaining"].map((k) => (
                    <p key={k}>
                      Table grant paths {k}:{" "}
                      {row[k].map((p) => p.join(" → ")).join(", ") || "none"}
                    </p>
                  ))
                : !row.reason && (
                    <p>Complete table grant path evidence is unavailable.</p>
                  )}
              <pre>
                {JSON.stringify(
                  { earlier: row.before, later: row.after },
                  null,
                  2,
                )}
              </pre>
            </details>
          ))}
        </section>
      )}
    </details>
  );
}
