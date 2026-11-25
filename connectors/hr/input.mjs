import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";

export async function readHrInput(input, scopePath) {
  const content = await readFile(input, "utf8");
  if (!input.toLowerCase().endsWith(".csv")) {
    if (scopePath) throw Error("A separate scope file applies only to CSV input");
    return JSON.parse(content);
  }
  if (!scopePath) throw Error("Supply a JSON scope file after the HR CSV path");
  const { source, hrObserved, hrRevision, resources, columns } =
    JSON.parse(await readFile(scopePath, "utf8"));
  const fields = ["id", "status", "role"];
  if (columns?.businessRole !== undefined) fields.push("businessRole");
  const names = fields.map((field) => columns?.[field]);
  if (names.some((name) => typeof name !== "string" || !name.trim()) ||
      new Set(names).size !== names.length) {
    throw Error("Map id, status and role to distinct CSV headers");
  }
  let rows;
  try {
    rows = parse(content, { bom: true, skip_empty_lines: true, record_delimiter: ["\r\n", "\n", "\r"] });
  } catch {
    throw Error("Malformed HR CSV. Check quoting and the number of columns");
  }
  const header = rows.shift() ?? [];
  if (names.some((name) => header.filter((h) => h === name).length !== 1)) {
    throw Error("Missing or duplicate mapped HR CSV header");
  }
  const [id, status, role, businessRole] = names.map((name) => header.indexOf(name));
  const employees = rows.map((row) => ({
    id: row[id],
    status: row[status],
    role: row[role] || null,
    ...(businessRole === undefined ? {} : { businessRole: row[businessRole] }),
  }));
  return { source, hrObserved, hrRevision, resources, employees };
}
