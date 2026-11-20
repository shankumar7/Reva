import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, until, wait, TOKEN, RevaClient, registerDevice, MemoryStore, type Envelope } from './helpers.js';

async function pair(ctx: Awaited<ReturnType<typeof setup>>) {
  const { c, url } = ctx;
  const a = c.newIdentity(), b = c.newIdentity();
  assert.deepEqual(await registerDevice(url, TOKEN, c.b64(a.signPk)), { ok: true, slot: 1 });
  assert.deepEqual(await registerDevice(url, TOKEN, c.b64(b.signPk)), { ok: true, slot: 2 });
  return { a, b };
}

function mk(ctx: any, id: any, peerId: any, store = new MemoryStore()) {
  const inbox: Envelope[] = [];
  const sent: string[] = [];
  const cl = new RevaClient({
    url: ctx.url, identity: id, crypto: ctx.c, peer: ctx.c.peerFromSignPk(peerId.signPk), store,
    events: { onEnvelope: (e) => inbox.push(e), onSent: (cid) => sent.push(cid) },
  });
  return { cl, inbox, sent, store };
}

test('registration closes after two devices; strangers cannot log in', async () => {
  const ctx = await setup();
  const { c, url } = ctx;
  await pair(ctx);
  const third = c.newIdentity();
  assert.deepEqual(await registerDevice(url, TOKEN, c.b64(third.signPk)), { ok: false, code: 'registration_closed' });
  // a stranger's key cannot connect
  const x = mk(ctx, third, third);
  let err = '';
  x.cl['o'].events!.onError = (e: string) => (err = e);
  x.cl.connect();
  await until(() => err === 'auth_failed');
  x.cl.disconnect();
  await ctx.srv.close();
});

test('wrong setup token is refused', async () => {
  const ctx = await setup();
  const r = await registerDevice(ctx.url, 'x'.repeat(30), ctx.c.b64(ctx.c.newIdentity().signPk));
  assert.deepEqual(r, { ok: false, code: 'bad_token' });
  await ctx.srv.close();
});

test('two devices: message arrives, replies, and the server only stores ciphertext', async () => {
  const ctx = await setup();
  const { a, b } = await pair(ctx);
  const A = mk(ctx, a, b), B = mk(ctx, b, a);
  A.cl.connect(); B.cl.connect();
  await until(() => A.cl.status === 'online' && B.cl.status === 'online');
  A.cl.send({ k: 'msg', id: 'm1', ts: 1, text: 'secret words' }, 'c1');
  await until(() => B.inbox.length === 1);
  assert.equal((B.inbox[0] as any).text, 'secret words');
  B.cl.send({ k: 'rcpt', ids: ['m1'], state: 'read' }, 'c2');
  await until(() => A.inbox.length === 1);
  assert.equal((A.inbox[0] as any).state, 'read');
  // nothing readable on the server, and delivered messages are removed
  const rows = ctx.srv.store.db.prepare('SELECT blob FROM queue').all() as any[];
  for (const r of rows) assert.ok(!r.blob.includes('secret'));
  await until(() => ctx.srv.store.queueSize() === 0);
  A.cl.disconnect(); B.cl.disconnect();
  await ctx.srv.close();
});

test('offline queue: sent while the other phone is off, delivered on return, exactly once and in order', async () => {
  const ctx = await setup();
  const { a, b } = await pair(ctx);
  const A = mk(ctx, a, b);
  A.cl.connect();
  await until(() => A.cl.status === 'online');
  for (let i = 1; i <= 3; i++) A.cl.send({ k: 'msg', id: 'm' + i, ts: i, text: 'n' + i }, 'c' + i);
  await until(() => A.sent.length === 3);
  const B = mk(ctx, b, a);
  B.cl.connect();
  await until(() => B.inbox.length === 3);
  assert.deepEqual(B.inbox.map((e: any) => e.text), ['n1', 'n2', 'n3']);
  await wait(100);
  B.cl.disconnect();
  const B2 = mk(ctx, b, a);
  B2.cl.connect();
  await until(() => B2.cl.status === 'online');
  await wait(200);
  assert.equal(B2.inbox.length, 0, 'already acked messages must not come again');
  A.cl.disconnect(); B2.cl.disconnect();
  await ctx.srv.close();
});

test('offline queue on the sending phone: written while the server is unreachable, sent after reconnect, survives restart', async () => {
  const ctx = await setup();
  const { a, b } = await pair(ctx);
  const store = new MemoryStore();
  const A = mk(ctx, a, b, store);
  // never connected: this is "no signal"
  A.cl.send({ k: 'msg', id: 'o1', ts: 1, text: 'sent in tunnel' }, 'o1');
  assert.equal(A.cl.pending, 1);
  assert.equal(store.items.length, 1);
  // app restarted: a new client loads the saved queue
  const A2 = mk(ctx, a, b, store);
  const B = mk(ctx, b, a);
  B.cl.connect();
  A2.cl.connect();
  await until(() => B.inbox.length === 1);
  assert.equal((B.inbox[0] as any).text, 'sent in tunnel');
  await until(() => store.items.length === 0);
  A2.cl.disconnect(); B.cl.disconnect();
  await ctx.srv.close();
});

test('reconnect after the connection drops (network change)', async () => {
  const ctx = await setup();
  const { a, b } = await pair(ctx);
  const A = mk(ctx, a, b), B = mk(ctx, b, a);
  A.cl.connect(); B.cl.connect();
  await until(() => A.cl.status === 'online' && B.cl.status === 'online');
  // kill A's socket underneath it, like switching Wi-Fi to mobile data
  (A.cl as any).ws.close();
  await until(() => A.cl.status !== 'online');
  A.cl.reconnectNow();
  await until(() => A.cl.status === 'online');
  B.cl.send({ k: 'msg', id: 'z', ts: 1, text: 'back?' }, 'z');
  await until(() => A.inbox.length === 1);
  A.cl.disconnect(); B.cl.disconnect();
  await ctx.srv.close();
});

test('typing is live only and never stored', async () => {
  const ctx = await setup();
  const { a, b } = await pair(ctx);
  const A = mk(ctx, a, b), B = mk(ctx, b, a);
  A.cl.connect(); B.cl.connect();
  await until(() => A.cl.peerOnline && B.cl.peerOnline);
  A.cl.sendEphemeral({ k: 'typing', on: true });
  await until(() => B.inbox.length === 1);
  assert.equal(ctx.srv.store.queueSize(), 0);
  A.cl.disconnect(); B.cl.disconnect();
  await ctx.srv.close();
});

test('messages from a key we did not pair with are dropped', async () => {
  const ctx = await setup();
  const { a, b } = await pair(ctx);
  const other = ctx.c.newIdentity();
  const A = mk(ctx, a, other); // A believes the peer is someone else
  const B = mk(ctx, b, a);
  A.cl.connect(); B.cl.connect();
  await until(() => A.cl.status === 'online' && B.cl.status === 'online');
  B.cl.send({ k: 'msg', id: 'x', ts: 1, text: 'hi' }, 'x');
  await wait(300);
  assert.equal(A.inbox.length, 0);
  A.cl.disconnect(); B.cl.disconnect();
  await ctx.srv.close();
});

test('a picture-sized message (800 KB) passes through, in order, with queueing', async () => {
  const ctx = await setup();
  const { a, b } = await pair(ctx);
  const A = mk(ctx, a, b);
  A.cl.connect();
  await until(() => A.cl.status === 'online');
  const big = 'x'.repeat(800_000);
  A.cl.send({ k: 'img', id: 'p1', ts: 1, data: big, thumb: 't', w: 100, h: 100, once: true } as any, 'p1');
  A.cl.send({ k: 'pin', id: 'p1', on: true }, 'p2');
  await until(() => A.sent.length === 2);
  const B = mk(ctx, b, a);
  B.cl.connect();
  await until(() => B.inbox.length === 2);
  assert.equal((B.inbox[0] as any).data.length, 800_000);
  assert.equal(B.inbox[1].k, 'pin');
  A.cl.disconnect(); B.cl.disconnect();
  await ctx.srv.close();
});

test('a big batch (400 messages) is paced, never rate-limited into loss, and arrives complete and in order', async () => {
  const ctx = await setup();
  const { a, b } = await pair(ctx);
  const A = mk(ctx, a, b), B = mk(ctx, b, a);
  A.cl.connect(); B.cl.connect();
  await until(() => A.cl.status === 'online' && B.cl.status === 'online');
  for (let i = 0; i < 400; i++) A.cl.send({ k: 'msg', id: 'b' + i, ts: i, text: 'm' + i }, 'b' + i);
  await until(() => B.inbox.length === 400, 25000);
  assert.deepEqual(B.inbox.map((e: any) => e.text), Array.from({ length: 400 }, (_, i) => 'm' + i));
  assert.equal(A.cl.pending, 0);
  A.cl.disconnect(); B.cl.disconnect();
  await ctx.srv.close();
});
