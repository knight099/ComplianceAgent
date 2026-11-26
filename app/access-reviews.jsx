"use client";
import { useEffect, useState } from "react";

const endpoint = "/api/v1/access-reviews";
const label = run => [run.source, run.policy_id, "v" + run.version, run.observed_at].join(" · ");
const key = row => JSON.stringify([row.employeeId, row.resource]);

function useReviewData(url) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw Error();
        const data = await response.json();
        if (!controller.signal.aborted) setResult({ url, data });
      } catch {
        if (!controller.signal.aborted) setResult({ url, error: true });
      }
    }
    load();
    return () => controller.abort();
  }, [url]);
  return url && result?.url === url ? result : {};
}

export default function AccessReviews() {
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState("");
  const [baseline, setBaseline] = useState("");
  const index = useReviewData(endpoint + "?refresh=" + refresh);
  const runs = index.data ?? [];
  const current = runs.find(run => run.id === selected) ?? runs[0];
  const older = current ? runs.filter(run => run.source === current.source && run.policy_id === current.policy_id &&
    Date.parse(run.observed_at) < Date.parse(current.observed_at)) : [];
  const previous = older.find(run => run.id === baseline);
  const latest = useReviewData(current && endpoint + "?id=" + current.id + "&refresh=" + refresh);
  const prior = useReviewData(previous && endpoint + "?id=" + previous.id + "&refresh=" + refresh);
  const before = new Map(prior.data?.rows.map(row => [key(row), row]));
  const now = new Set(latest.data?.rows.map(key));
  return <section id="personal-data">
    <h2>Personal-data access reviews</h2>
    <button onClick={() => setRefresh(value => value + 1)}>Refresh reviews</button>
    {(index.error || latest.error || prior.error) && <p role="alert">Access review unavailable. Refresh to retry.</p>}
    {index.data && !runs.length && <p>No policy reviews submitted yet.</p>}
    {current && <>
      <p><label>Assessment <select value={current.id} onChange={event => { setSelected(event.target.value); setBaseline(""); }}>
        {runs.map(run => <option key={run.id} value={run.id}>{label(run)}</option>)}
      </select></label></p>
      <label>Compare with <select value={previous?.id ?? ""} onChange={event => setBaseline(event.target.value)}>
        <option value="">Choose an earlier assessment</option>
        {older.map(run => <option key={run.id} value={run.id}>{label(run)}</option>)}
      </select></label>
    </>}
    {latest.data && <>
      <p>Policy {latest.data.policy.reference} · Reviewed by {latest.data.policy.reviewer} · Submitted by {current.submitted_by}</p>
      <p>HR revision {latest.data.hrRevision} · Observed {latest.data.hrObserved}</p>
      {!latest.data.rows.length && <p>No employee and table pairs in this collection.</p>}
      {latest.data.rows.map(row => <details key={key(row)}>
        <summary>{row.employeeId} · {row.resource.join(".")} · {row.outcome}</summary>
        <p>{row.classification ?? "Unclassified"} · Business role {row.businessRole ?? "unknown"} · Database role {row.databaseRole || "unknown"}</p>
        <p>Expected {row.expected ?? "unknown"} · Observed {row.observed ?? "unknown"}</p>
        {row.exception && <p>Exception {row.exception.reference} · Approved by {row.exception.approver} · Expires {row.exception.until}</p>}
        {prior.data && <p>Previous outcome {before.get(key(row))?.outcome ?? "Outside earlier scope"} · Previous observed access {before.get(key(row))?.observed ?? "unknown"}</p>}
        <pre>{JSON.stringify(row.evidence, null, 2)}</pre>
      </details>)}
      {prior.data?.rows.filter(row => !now.has(key(row))).map(row => <p key={key(row)}>
        {row.employeeId} · {row.resource.join(".")} · Outside current scope · Previously {row.outcome}
      </p>)}
    </>}
  </section>;
}
