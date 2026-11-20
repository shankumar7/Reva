import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Fcm } from '../src/fcm.js';
import { createServer } from '../src/server.js';
import { setup, until, wait, TOKEN, RevaClient, registerDevice, MemoryStore } from './helpers.js';

test('push: a wake-up is sent when the other phone is offline, with no message content, and not repeated within 20s', async () => {
  // a fake Google: token endpoint and FCM endpoint
  const seen: { path: string; auth?: string; body: string }[] = [];
  const google = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ path: req.url ?? '', auth: req.headers.authorization, body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(req.url === '/token' ? JSON.stringify({ access_token: 'fake-access', expires_in: 3600 }) : '{}');
    });
  });
  await new Promise<void>((r) => google.listen(0, '127.0.0.1', r));
  const gport = (google.address() as any).port;

  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcm-'));
  const saFile = path.join(dir, 'fcm.json');
  fs.writeFileSync(saFile, JSON.stringify({
    project_id: 'demo', client_email: 'x@demo.iam.gserviceaccount.com', token_uri: `http://127.0.0.1:${gport}/token`,
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  }));
  const fcm = new Fcm(saFile, { send: () => `http://127.0.0.1:${gport}/send` });

  const ctx = await setup();
  await ctx.srv.close();
  const srv = await createServer({ dbPath: path.join(dir, 'c.db'), setupToken: TOKEN, port: 0, host: '127.0.0.1', fcm });
  const url = `ws://127.0.0.1:${srv.port}`;
  const c = ctx.c;
  const a = c.newIdentity(), b = c.newIdentity();
  await registerDevice(url, TOKEN, c.b64(a.signPk));
  await registerDevice(url, TOKEN, c.b64(b.signPk));

  // B tells the server its notification address, then goes offline
  const B = new RevaClient({ url, identity: b, crypto: c, peer: c.peerFromSignPk(a.signPk), store: new MemoryStore() });
  B.connect();
  await until(() => B.status === 'online');
  (B as any).raw({ t: 'push', token: 'x'.repeat(40), kind: 'notes' });
  await wait(100);
  B.disconnect();
  await wait(100);

  const A = new RevaClient({ url, identity: a, crypto: c, peer: c.peerFromSignPk(b.signPk), store: new MemoryStore() });
  A.connect();
  await until(() => A.status === 'online');
  A.send({ k: 'msg', id: '1', ts: 1, text: 'TOP SECRET WORDS' }, 'c1');
  A.send({ k: 'msg', id: '2', ts: 2, text: 'second one' }, 'c2');
  await until(() => seen.some((s) => s.path === '/send'));
  await wait(200);

  const sends = seen.filter((s) => s.path === '/send');
  assert.equal(sends.length, 1, 'only one wake-up for two quick messages');
  assert.equal(sends[0].auth, 'Bearer fake-access');
  const body = JSON.parse(sends[0].body);
  assert.equal(body.message.token, 'x'.repeat(40));
  assert.equal(body.message.notification.title, 'Notes');
  assert.ok(!sends[0].body.includes('SECRET') && !sends[0].body.includes('second'), 'no message content may be sent');
  A.disconnect();
  await srv.close();
  google.close();
});

test('push: a call offer wakes the sleeping phone at once, as an "Alarm", even right after another wake-up', async () => {
  const seen: { path: string; body: string }[] = [];
  const google = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ path: req.url ?? '', body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(req.url === '/token' ? JSON.stringify({ access_token: 'fake-access', expires_in: 3600 }) : '{}');
    });
  });
  await new Promise<void>((r) => google.listen(0, '127.0.0.1', r));
  const gport = (google.address() as any).port;
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcm-'));
  const saFile = path.join(dir, 'fcm.json');
  fs.writeFileSync(saFile, JSON.stringify({ project_id: 'demo', client_email: 'x@demo.iam.gserviceaccount.com', token_uri: `http://127.0.0.1:${gport}/token`, private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }));
  const fcm = new Fcm(saFile, { send: () => `http://127.0.0.1:${gport}/send` });
  const ctx = await setup();
  await ctx.srv.close();
  const srv = await createServer({ dbPath: path.join(dir, 'c.db'), setupToken: TOKEN, port: 0, host: '127.0.0.1', fcm });
  const url = `ws://127.0.0.1:${srv.port}`;
  const c = ctx.c;
  const a = c.newIdentity(), b = c.newIdentity();
  await registerDevice(url, TOKEN, c.b64(a.signPk));
  await registerDevice(url, TOKEN, c.b64(b.signPk));
  const B = new RevaClient({ url, identity: b, crypto: c, peer: c.peerFromSignPk(a.signPk), store: new MemoryStore() });
  B.connect();
  await until(() => B.status === 'online');
  (B as any).raw({ t: 'push', token: 'y'.repeat(40), kind: 'calculator' });
  await wait(100);
  B.disconnect();
  await wait(100);
  const A = new RevaClient({ url, identity: a, crypto: c, peer: c.peerFromSignPk(b.signPk), store: new MemoryStore() });
  A.connect();
  await until(() => A.status === 'online');
  A.send({ k: 'msg', id: '1', ts: 1, text: 'hi' }, 'c1'); // an ordinary wake-up first
  await until(() => seen.filter((s) => s.path === '/send').length === 1);
  assert.ok(A.sendUrgent({ k: 'call', op: 'offer', cid: 'x', ts: Date.now(), sdp: 'v=0 SECRET-SDP' }));
  await until(() => seen.filter((s) => s.path === '/send').length === 2);
  const second = seen.filter((s) => s.path === '/send')[1];
  assert.equal(JSON.parse(second.body).message.notification.title, 'Alarm');
  assert.ok(!second.body.includes('SECRET'));
  A.disconnect();
  await srv.close();
  google.close();
});

test('push: a phone can switch its notifications off (used by the wipe)', async () => {
  const ctx = await setup();
  const { a, b } = await (async () => {
    const x = ctx.c.newIdentity(), y = ctx.c.newIdentity();
    await registerDevice(ctx.url, TOKEN, ctx.c.b64(x.signPk));
    await registerDevice(ctx.url, TOKEN, ctx.c.b64(y.signPk));
    return { a: x, b: y };
  })();
  const B = new RevaClient({ url: ctx.url, identity: b, crypto: ctx.c, peer: ctx.c.peerFromSignPk(a.signPk), store: new MemoryStore() });
  B.connect();
  await until(() => B.status === 'online');
  B.setPush('t'.repeat(40), 'chat');
  await wait(150);
  assert.equal(ctx.srv.store.getPush(2)?.token, 't'.repeat(40));
  B.clearPush();
  await wait(150);
  assert.equal(ctx.srv.store.getPush(2), null);
  B.disconnect();
  await ctx.srv.close();
});
