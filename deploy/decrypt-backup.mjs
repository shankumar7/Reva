// Open a downloaded backup:  BACKUP_KEY=<64 hex> node decrypt-backup.mjs chat-2026-01-01.enc restored.db
import fs from 'node:fs';
import crypto from 'node:crypto';
const [, , inp, out] = process.argv;
const key = Buffer.from(process.env.BACKUP_KEY ?? '', 'hex');
if (!inp || !out || key.length !== 32) { console.error('usage: BACKUP_KEY=<64 hex> node decrypt-backup.mjs in.enc out.db'); process.exit(1); }
const b = fs.readFileSync(inp);
const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
d.setAuthTag(b.subarray(12, 28));
fs.writeFileSync(out, Buffer.concat([d.update(b.subarray(28)), d.final()]));
console.log('restored to', out);
