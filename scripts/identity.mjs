import { database } from "../lib/store.mjs";
import { issue, revoke, setOperatorRole } from "../lib/identities.mjs";
const [operation, kind, name, source] = process.argv.slice(2);
const db = database();
try {
  if (operation === "set-role" && kind === "operator")
    await setOperatorRole(db, name, source);
  else if (operation === "issue")
    console.log(
      kind === "operator"
        ? await issue(db, kind, name, null, source)
        : await issue(db, kind, name, source),
    );
  else if (operation === "revoke") {
    if (!(await revoke(db, kind, name)))
      throw Error("Active identity not found");
    console.log("Revoked", kind, name);
  } else throw Error("Use issue, set-role operator or revoke");
} finally {
  await db.end();
}
