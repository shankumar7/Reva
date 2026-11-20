import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createServer } from '../src/server.js';
import { setup, until, TOKEN, RevaClient, registerDevice, MemoryStore } from './helpers.js';

async function run(turn: boolean) {
  const ctx = await setup();
  await ctx.srv.close();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ice-'));
  const srv = await createServer({ dbPath: path.join(dir, 'c.db'), setupToken: TOKEN, port: 0, host: '127.0.0.1', ...(turn ? { turnHost: 'calls.example.org', turnSecret: 'sekrit-sekrit-sekrit' } : {}) });
  const url = `ws://127.0.0.1:${srv.port}`;
  const { c } = ctx;
  const a = c.newIdentity(), b = c.newIdentity();
  await registerDevice(url, TOKEN, c.b64(a.signPk));
  await registerDevice(url, TOKEN, c.b64(b.signPk));
  const cl = new RevaClient({ url, identity: a, crypto: c, peer: c.peerFromSignPk(b.signPk), store: new MemoryStore(), events: {} });
  cl.connect();
  await until(() => cl.status === 'online');
  const servers = await cl.requestIce();
  cl.disconnect();
  await srv.close();
  return servers;
}

test('call relay: short-lived login that coturn can verify', async () => {
  const [s] = await run(true);
  assert.ok(s.urls.some((u) => u.startsWith('turn:calls.example.org:3478')));
  const [expiry, name] = s.username!.split(':');
  assert.equal(name, 'reva');
  assert.ok(Number(expiry) * 1000 > Date.now() && Number(expiry) * 1000 < Date.now() + 3700_000);
  const expected = crypto.createHmac('sha1', 'sekrit-sekrit-sekrit').update(s.username!).digest('base64');
  assert.equal(s.credential, expected);
});

test('call relay: no relay configured gives an empty list, not an error', async () => {
  assert.deepEqual(await run(false), []);
});
