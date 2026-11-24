"use client";
import { useState } from "react";
import { reconcile } from "../lib/reconcile.mjs";
export default function PilotReview({ run }) {
  const [report, setReport] = useState(null),
    [error, setError] = useState("");
  async function load(file) {
    setReport(null);
    setError("");
    if (!file) return;
    try {
      if (file.size > 4 * 1024 * 1024) throw Error("Baseline exceeds 4 MiB.");
      setReport(reconcile(run, JSON.parse(await file.text())));
    } catch (e) {
      setError(e instanceof SyntaxError ? "Invalid JSON." : e.message);
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "pilot-review-" + run.id + ".json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <details>
      <summary>Reconcile with data-owner baseline</summary>
      <p>
        Select the reviewed JSON baseline for this source. Comparison runs in
        your browser.
      </p>
      <label>
        Baseline file{" "}
        <input
          type="file"
          accept=".json,application/json"
          onChange={(e) => load(e.target.files?.[0])}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {report && (
        <>
          <p>
            {Object.entries(report.counts)
              .map(([status, n]) => status + " " + n)
              .join(" · ")}
          </p>
          <p>
            {report.unresolvedEmployees} unresolved employees ·{" "}
            {report.failedChecks} failed database checks
          </p>
          <button onClick={download}>Download reconciliation report</button>
        </>
      )}
    </details>
  );
}
