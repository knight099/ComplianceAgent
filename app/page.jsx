import { ShieldCheck, LayoutGrid, ShieldAlert, Network, BookOpen, FileCheck, Workflow, Plug, Server, Archive, ChartColumn, Bot, Settings, Bell, CircleUserRound } from "lucide-react";
import { Workspace } from "./ui/workspace";
import styles from "./ui/workspace.module.css";

import OverviewResults from "./overview-results";

const design = "https://github.com/knight099/ComplianceAgent/blob/develop/enterprise-core/docs/complyos-2-system-design.md";
const navigation = [
  ["Overview", LayoutGrid, "/"],
  ["Collection alerts", ShieldAlert, "/operations#alerts"],
  ["Enterprise graph", Network, "/operations"],
  ["Regulations", BookOpen, design + "#10-regulatory-intelligence-engine"],
  ["Policies", FileCheck, design + "#11-policy-evaluation-architecture"],
  ["Remediation", Workflow, design + "#14-remediation-orchestration-architecture"],
  ["Integrations", Plug, "/operations#health"],
  ["Agent fleet", Server, "/operations#health"],
  ["Evidence", Archive, "/operations"],
  ["Reports", ChartColumn, "/reports"],
  ["AI Copilot", Bot, "/operations#model"],
  ["Settings", Settings, "/operations#model"],
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
        <OverviewResults />
      </main>
    </div>
  </Workspace>;
}
