import styles from "./workspace.module.css";

export function Workspace({ children }) {
  return <div className={styles.canvas}><div className={styles.workspace}>{children}</div></div>;
}

export function Metric({ label, value, tone = "neutral" }) {
  return <div className={styles.metric}><span>{label}</span><strong data-tone={tone}>{value}</strong></div>;
}

export function Panel({ title, children }) {
  return <section className={styles.panel}><h2>{title}</h2>{children}</section>;
}

export function ResultBar({ label, value, tone }) {
  return <div className={styles.result}>
    <div><span>{label}</span><span>{value}%</span></div>
    <progress aria-label={label} value={value} max={100} data-tone={tone} />
  </div>;
}
