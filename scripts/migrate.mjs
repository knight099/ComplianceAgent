import { migrate, database } from "../lib/store.mjs";
try {
  await migrate();
} finally {
  await database().end();
}
