// Daily encrypted copy of the server database. The key is separate from everything else.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Store } from './db.js';

export function encryptBuffer(plain: Buffer, keyHex: string): Buffer {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) throw new Error('BACKUP_KEY must be 64 hex characters');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}

export function decryptBuffer(blob: Buffer, keyHex: string): Buffer {
  const key = Buffer.from(keyHex, 'hex');
  const d = crypto.createDecipheriv('aes-256-gcm', key, blob.subarray(0, 12));
  d.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
}

/** Writes backups/chat-YYYY-MM-DD.enc and keeps the newest `keep`. Returns the file path. */
export function makeBackup(store: Store, dir: string, keyHex: string, keep = 7): string {
  fs.mkdirSync(dir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const tmp = path.join(dir, `.tmp-${process.pid}.db`);
  fs.rmSync(tmp, { force: true });
  store.db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  const enc = encryptBuffer(fs.readFileSync(tmp), keyHex);
  fs.rmSync(tmp, { force: true });
  const out = path.join(dir, `chat-${day}.enc`);
  fs.writeFileSync(out, enc, { mode: 0o600 });
  const all = fs.readdirSync(dir).filter((f) => /^chat-\d{4}-\d{2}-\d{2}\.enc$/.test(f)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - keep))) fs.rmSync(path.join(dir, old), { force: true });
  return out;
}

export function latestBackup(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const all = fs.readdirSync(dir).filter((f) => /^chat-\d{4}-\d{2}-\d{2}\.enc$/.test(f)).sort();
  return all.length ? path.join(dir, all[all.length - 1]) : null;
}
