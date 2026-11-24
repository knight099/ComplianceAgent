import { DatabaseSync } from "node:sqlite";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  linkSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";

function localKey(dir) {
  const path = join(dir, "relay.key");
  try {
    return readFileSync(path);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const temp = join(dir, randomUUID() + ".key");
  writeFileSync(temp, randomBytes(32), {
    flag: "wx",
    mode: 0o600,
    flush: true,
  });
  try {
    linkSync(temp, path);
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  } finally {
    unlinkSync(temp);
  }
  return readFileSync(path);
}

export function openOutbox(dir, origin) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const key = localKey(dir);
  const db = new DatabaseSync(join(dir, "outbox.sqlite"));
  db.exec(
    "PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS pending (id TEXT PRIMARY KEY, origin TEXT NOT NULL, payload BLOB NOT NULL)",
  );
  const context = (id) => Buffer.from(JSON.stringify([origin, id]));
  return {
    enqueue(report) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      cipher.setAAD(context(report.id));
      const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(report), "utf8"),
        cipher.final(),
      ]);
      db.prepare("INSERT INTO pending VALUES(?,?,?)").run(
        report.id,
        origin,
        Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]),
      );
    },
    async flush(deliver) {
      let count = 0;
      const next = db.prepare("SELECT id,payload FROM pending WHERE origin=? ORDER BY rowid LIMIT 1");
      while (true) {
        const row = next.get(origin);
        if (!row) break;
        const {id, payload} = row;
        const bytes = Buffer.from(payload);
        const decipher = createDecipheriv(
          "aes-256-gcm",
          key,
          bytes.subarray(0, 12),
        );
        decipher.setAAD(context(id));
        decipher.setAuthTag(bytes.subarray(12, 28));
        const body = Buffer.concat([
          decipher.update(bytes.subarray(28)),
          decipher.final(),
        ]).toString("utf8");
        const receipt = await deliver(body);
        if (receipt?.id !== id)
          throw Error("Receipt did not match queued assessment");
        db.prepare("DELETE FROM pending WHERE id=? AND origin=?").run(
          id,
          origin,
        );
        count++;
      }
      return count;
    },
    close() {
      db.close();
    },
  };
}
