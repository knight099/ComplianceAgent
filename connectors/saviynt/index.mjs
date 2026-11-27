// A tenant-owned Analytics control supplies the column aliases documented in the operator guide.
const text = value => typeof value === "string" && value.trim().length > 0;
const statuses = new Set(["approved", "revoked", "pending", "denied"]);
const fields = ["recordId", "employeeId", "account", "schema", "table", "entitlement", "status", "approvedRole"];
const key = (subject, account, resource) => JSON.stringify([subject, account, ...resource]);

function normalize(record) {
  if (!record || !fields.every(field => text(record[field])) || !statuses.has(record.status) ||
      !Object.hasOwn(record, "expiresAt") || (record.expiresAt !== null &&
      (!text(record.expiresAt) || !Number.isFinite(Date.parse(record.expiresAt))))) throw Error("Invalid governance record");
  return Object.fromEntries([...fields, "expiresAt"].map(field => [field, record[field]]));
}

export async function collectSaviynt(config, source, token, send = fetch) {
  const url = new URL(config.origin);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      config.source !== source || !text(config.analyticsName) || !text(token)) throw Error("Invalid Saviynt configuration");
  url.pathname = "/ECM/api/v5/fetchRuntimeControlsDataV2";
  const byAccount = new Map(), ids = new Set();
  const base = { analyticsName: config.analyticsName, observedAt: new Date().toISOString() };
  let offset = 0, total;
  try {
    do {
      const response = await send(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ analyticsname: config.analyticsName, offset, max: 100 }) });
      if (!response.ok) throw Error("Page unavailable");
      const page = await response.json();
      const count = typeof page.totalcount === "string" && /^\d+$/.test(page.totalcount) ? Number(page.totalcount) : page.totalcount;
      if ((page.errorCode != null && String(page.errorCode) !== "0") || !Number.isSafeInteger(count) ||
          count < 0 || count > 100000 || (total !== undefined && total !== count) ||
          !Array.isArray(page.results) || page.results.length > 100 || offset + page.results.length > count ||
          (offset < count && !page.results.length)) throw Error("Incomplete analytics result");
      total = count;
      for (const raw of page.results) {
        const record = normalize(raw);
        if (ids.has(record.recordId)) throw Error("Repeated governance record");
        ids.add(record.recordId);
        const subject = key(record.employeeId, record.account, [record.schema, record.table]);
        if (!byAccount.has(subject)) byAccount.set(subject, []);
        byAccount.get(subject).push(record);
      }
      offset += page.results.length;
    } while (offset < total);
    return { ...base, coverage: "observed", byAccount };
  } catch {
    return { ...base, coverage: "unavailable", byAccount: new Map() };
  }
}

export function attachGovernance(report, snapshot) {
  report.saviynt = { analyticsName: snapshot.analyticsName, observedAt: snapshot.observedAt, coverage: snapshot.coverage };
  for (const row of report.rows) {
    row.governance = snapshot.byAccount.get(key(row.employeeId, row.databaseRole, row.resource)) ?? [];
  }
}

export function validateGovernance(report, row) {
  if (report.saviynt === undefined && row.governance === undefined) return;
  if (!Array.isArray(row.governance) || !report.saviynt ||
      (report.saviynt.coverage === "unavailable" && row.governance.length)) throw Error("Invalid governance coverage");
  const ids = new Set();
  for (const record of row.governance) {
    normalize(record);
    if (ids.has(record.recordId) || record.employeeId !== row.employeeId || record.account !== row.databaseRole ||
        record.schema !== row.resource[0] || record.table !== row.resource[1]) throw Error("Conflicting governance evidence");
    ids.add(record.recordId);
  }
}
