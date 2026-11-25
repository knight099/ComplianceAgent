import { ShieldCheck, LayoutGrid, ShieldAlert, Network, BookOpen, FileCheck, Workflow, Plug, Server, Archive, ChartColumn, Bot, Settings, Bell, CircleUserRound, CircleAlert } from "lucide-react";
import { Workspace, Metric, Panel, ResultBar } from "./ui/workspace";
import styles from "./ui/workspace.module.css";

const design = "https://github.com/knight099/ComplianceAgent/blob/develop/enterprise-core/docs/complyos-2-system-design.md";
const navigation = [
  ["Overview", LayoutGrid, "/"],
  ["Incidents", ShieldAlert, "#priority-incidents"],
  ["Enterprise graph", Network, "/operations"],
  ["Regulations", BookOpen, design + "#10-regulatory-intelligence-engine"],
  ["Policies", FileCheck, design + "#11-policy-evaluation-architecture"],
  ["Remediation", Workflow, design + "#14-remediation-orchestration-architecture"],
  ["Integrations", Plug, "/operations#health"],
  ["Agent fleet", Server, "/operations#health"],
  ["Evidence", Archive, "/operations"],
  ["Reports", ChartColumn, "/operations"],
  ["AI Copilot", Bot, "/operations#model"],
  ["Settings", Settings, "/operations#model"],
];
const incidents = [
  ["Terminated user retains access", "IAM · PostgreSQL", "critical"],
  ["Unapproved KYC permissions", "HRMS · AWS", "warning"],
  ["Endpoint evidence stale", "14 devices", "unknown"],
];

export default function Overview() {
  return <Workspace>
    <header className={styles.topbar}>
      <a href="/" className={styles.brand}><ShieldCheck aria-hidden="true" />ComplyOS</a>
      <div className={styles.tools}>
        <a href="/operations#alerts" aria-label="Collection alerts"><Bell size={18} /></a>
        <a href="/operations" aria-label="Open operator workspace"><CircleUserRound size={22} /></a>
      </div>
    </header>
    <div className={styles.layout}>
      <nav className={styles.navigation} aria-label="Workspace">
        {navigation.map(([label, Icon, href]) => <a key={label} href={href} aria-current={label === "Overview" ? "page" : undefined} title={href.startsWith("https:") ? label + " architecture" : label}>
          <Icon size={16} aria-hidden="true" /><span>{label}</span>
        </a>)}
      </nav>
      <main className={styles.content}>
        <h1>Compliance overview</h1>
        <p className={styles.subtitle}>Illustrative enterprise workspace</p>
        <div className={styles.metrics}>
          <Metric label="Controls passing" value="82%" tone="passing" />
          <Metric label="Open incidents" value="24" tone="critical" />
          <Metric label="Evidence coverage" value="91%" />
          <Metric label="Pending approvals" value="8" tone="warning" />
        </div>
        <Panel title="Control results">
          <ResultBar label="Passing" value={82} tone="passing" />
          <ResultBar label="Failing" value={8} tone="critical" />
          <ResultBar label="Unknown" value={7} tone="unknown" />
          <ResultBar label="Exception" value={3} tone="warning" />
        </Panel>
        <div id="priority-incidents"><Panel title="Priority incidents">
          {incidents.map(([label, source, tone]) => <div key={label} className={styles.incident}>
            <CircleAlert data-tone={tone} size={19} aria-hidden="true" />
            <div>{label}<span>{source}</span></div>
          </div>)}
        </Panel></div>
      </main>
    </div>
  </Workspace>;
}
