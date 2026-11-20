import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { setup, TOKEN, registerDevice } from './helpers.js';
import { makeBackup, decryptBuffer, latestBackup } from '../src/backup.js';

const KEY = crypto.randomBytes(32).toString('hex');

test('backup is encrypted, restorable with the key, and not with another key', async () => {
  const ctx = await setup();
  await registerDevice(ctx.url, TOKEN, ctx.c.b64(ctx.c.newIdentity().signPk));
  ctx.srv.store.enqueue(1, 'cipher-blob-abc');
  const dir = path.join(ctx.dir, 'bk');
  const f = makeBackup(ctx.srv.store, dir, KEY);
  const raw = fs.readFileSync(f);
  assert.ok(!raw.includes(Buffer.from('cipher-blob-abc')), 'backup file must not hold readable data');
  const plain = decryptBuffer(raw, KEY);
  const restored = path.join(ctx.dir, 'restored.db');
  fs.writeFileSync(restored, plain);
  const d = new DatabaseSync(restored);
  assert.equal((d.prepare('SELECT COUNT(*) AS n FROM queue').get() as any).n, 1);
  d.close();
  assert.throws(() => decryptBuffer(raw, crypto.randomBytes(32).toString('hex')));
  assert.equal(latestBackup(dir), f);
  await ctx.srv.close();
});

test('only a registered device can download a backup or an update', async () => {
  const ctx = await setup();
  await ctx.srv.close();
  const dir = fs.mkdtempSync(path.join(ctx.dir, 'x'));
  fs.mkdirSync(path.join(dir, 'u'));
  fs.writeFileSync(path.join(dir, 'u', 'latest.json'), JSON.stringify({ versionCode: 2, versionName: '0.2.0' }));
  const { createServer } = await import('../src/server.js');
  const srv = await createServer({ dbPath: path.join(dir, 'c.db'), setupToken: TOKEN, port: 0, host: '127.0.0.1', updatesDir: path.join(dir, 'u'), backupDir: path.join(dir, 'b'), backupKey: KEY });
  const a = ctx.c.newIdentity();
  await registerDevice(`ws://127.0.0.1:${srv.port}`, TOKEN, ctx.c.b64(a.signPk));
  makeBackup(srv.store, path.join(dir, 'b'), KEY);
  const get = async (p: string, who: typeof a | null, scope: string) => {
    const minute = String(Math.floor(Date.now() / 60000));
    const h: Record<string, string> = {};
    if (who) Object.assign(h, { 'x-device': ctx.c.b64(who.signPk), 'x-minute': minute, 'x-sig': ctx.c.signChallenge(who, scope + minute) });
    return (await fetch(`http://127.0.0.1:${srv.port}${p}`, { headers: h })).status;
  };
  assert.equal(await get('/update/latest.json', a, 'update|'), 200);
  assert.equal(await get('/backup/latest.enc', a, 'backup|'), 200);
  assert.equal(await get('/update/latest.json', null, 'update|'), 401);
  assert.equal(await get('/update/latest.json', ctx.c.newIdentity(), 'update|'), 401);
  assert.equal(await get('/backup/latest.enc', a, 'update|'), 401, 'a signature for updates must not work for backups');
  await srv.close();
});
