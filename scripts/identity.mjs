import { database } from "../lib/store.mjs";
import { issue, revoke } from "../lib/identities.mjs";
const [operation, kind, name, source] = process.argv.slice(2);
const db = database();
try {
  if (operation === "issue") console.log(await issue(db, kind, name, source));
  else if (operation === "revoke") {
    if (!(await revoke(db, kind, name)))
      throw Error("Active identity not found");
    console.log("Revoked", kind, name);
  } else throw Error("Use issue or revoke");
} finally {
  await db.end();
}
