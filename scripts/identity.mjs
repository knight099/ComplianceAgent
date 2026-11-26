import { database } from "../lib/store.mjs";
import { issue, revoke, setOperatorRole } from "../lib/identities.mjs";
const [operation, kind, name, source] = process.argv.slice(2);
const db = database();
try {
  const organization = process.env.COMPLYOS_ORGANIZATION_ID ?? "installation";
  if (operation === "create-organization" && /^[A-Za-z0-9_.-]{1,80}$/.test(kind ?? ""))
    await db.query("INSERT INTO organizations(id) VALUES($1) ON CONFLICT DO NOTHING", [kind]);
  else if (operation === "set-role" && kind === "operator")
    await setOperatorRole(db, name, source, organization);
  else if (operation === "issue")
    console.log(
      kind === "operator"
        ? await issue(db, kind, name, null, source, organization)
        : await issue(db, kind, name, source, undefined, organization),
    );
  else if (operation === "revoke") {
    if (!(await revoke(db, kind, name, organization)))
      throw Error("Active identity not found");
    console.log("Revoked", kind, name);
  } else throw Error("Use create-organization ID, issue, set-role operator or revoke");
} finally {
  await db.end();
}
