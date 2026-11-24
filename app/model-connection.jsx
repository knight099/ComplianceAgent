"use client";
import { useEffect, useState } from "react";
export default function ModelConnection({ runs }) {
  const [names, list] = useState([]),
    [provider, select] = useState(""),
    [model, setModel] = useState(""),
    [key, setKey] = useState(""),
    [id, pick] = useState(""),
    [busy, lock] = useState(false),
    [message, show] = useState("");
  useEffect(() => {
    if (!runs) return;
    let active = true;
    fetch("/api/ai")
      .then(async (r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((data) => {
        if (active) {
          list(data.providers);
          select((prev) =>
            data.providers.includes(prev) ? prev : data.providers[0] || "",
          );
        }
      })
      .catch(() => {
        if (active) show("Model settings unavailable.");
      });
    return () => {
      active = false;
    };
  }, [runs]);
  const selected = runs?.find((a) => a.id === id) || runs?.[0];
  async function submit(op) {
    lock(true);
    show("");
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, id: selected?.id, provider, model, key }),
      });
      const result = await res.json();
      show(
        res.ok
          ? op === "test"
            ? result.text
            : "AI summary for " +
              selected.source +
              " (" +
              selected.id +
              "): " +
              result.text
          : result.error,
      );
    } catch {
      show("Model service unavailable.");
    } finally {
      lock(false);
    }
  }
  if (!runs) return null;
  return (
    <details>
      <summary>AI model connection</summary>
      <fieldset disabled={busy} onChange={() => show("")}>
        <label>
          Provider{" "}
          <select
            value={provider}
            onChange={(e) => {
              select(e.target.value);
              setKey("");
              setModel("");
            }}
          >
            {names.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>{" "}
        <label>
          Model ID{" "}
          <input value={model} onChange={(e) => setModel(e.target.value)} />
        </label>{" "}
        <label>
          API key{" "}
          <input
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </label>
        <p>
          The key is held for this page session. Your selected provider receives
          the model request. A connection test sends a fixed prompt.
        </p>
        <button
          disabled={!provider || !model.trim()}
          onClick={() => submit("test")}
        >
          Test connection
        </button>
        {selected && (
          <>
            <p>
              Summaries send the collection time, freshness and decision counts.
            </p>
            <label>
              Assessment{" "}
              <select
                value={selected.id}
                onChange={(e) => pick(e.target.value)}
              >
                {runs.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.source}
                  </option>
                ))}
              </select>
            </label>{" "}
            <button
              disabled={!provider || !model.trim()}
              onClick={() => submit("explain")}
            >
              Generate summary
            </button>
          </>
        )}
        <button
          onClick={() => {
            setKey("");
            setModel("");
            show("Connection cleared.");
          }}
        >
          Clear connection
        </button>
      </fieldset>
      <p role="status">{message}</p>
    </details>
  );
}
