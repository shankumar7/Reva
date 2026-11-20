import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CallEngine, callSummary, type CallEnded, type PcLike, type RtcDeps } from '../src/core/call';
import type { Envelope } from '../../shared/protocol';

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

/** Two fake phones joined by a fake chat server. Fake calls "connect" once both sides have both descriptions. */
function pair(opts: { ringMs?: number; micDenied?: 'a' | 'b'; dropMs?: number } = {}) {
  const sent: { from: 'a' | 'b'; env: Envelope; persistent: boolean }[] = [];
  const pcs: Record<'a' | 'b', FakePc | null> = { a: null, b: null };
  const online = { a: true, b: true };
  const ended = { a: [] as CallEnded[], b: [] as CallEnded[] };
  const engines = {} as Record<'a' | 'b', CallEngine>;
  let clock = 1_000_000;

  class FakePc implements PcLike {
    local = ''; remote = ''; cb: ((c: string) => void) | null = null; st: ((s: any) => void) | null = null; cands: string[] = []; closed = false;
    constructor(public who: 'a' | 'b') { pcs[who] = this; }
    async createOffer() { return 'offer-from-' + this.who; }
    async createAnswer() { return 'answer-from-' + this.who; }
    async setLocal(_t: any, sdp: string) { this.local = sdp; setTimeout(() => { this.cb?.('cand1-' + this.who); this.cb?.('cand2-' + this.who); this.maybe(); }, 1); }
    async setRemote(_t: any, sdp: string) { this.remote = sdp; this.maybe(); }
    async addCandidate(c: string) { if (!this.remote) throw new Error('no remote yet'); this.cands.push(c); }
    onCandidate(cb: (c: string) => void) { this.cb = cb; }
    onState(cb: any) { this.st = cb; }
    close() { this.closed = true; }
    maybe() { if (this.local && this.remote) setTimeout(() => this.st?.('connected'), 2); }
  }

  for (const who of ['a', 'b'] as const) {
    const other = who === 'a' ? 'b' : 'a';
    const rtc: RtcDeps = {
      getMic: async () => { if (opts.micDenied === who) throw new Error('denied'); return { setMuted() {}, stop() {} }; },
      createPc: () => new FakePc(who),
    };
    engines[who] = new CallEngine({
      rtc, ringMs: opts.ringMs ?? 500, dropMs: opts.dropMs ?? 50, now: () => clock, newId: () => 'call1',
      getIce: async () => [],
      send: (env, persistent) => {
        sent.push({ from: who, env, persistent });
        if (online[other] || persistent) setTimeout(() => { if (online[other]) engines[other].onEnvelope(env); }, 1);
      },
    });
    engines[who].endedListeners.add((e) => ended[who].push(e));
  }
  return { engines, sent, pcs, ended, online, advance: (ms: number) => { clock += ms; } };
}

test('a call rings, is answered, connects, and both sides log the length', async () => {
  const t = pair();
  await t.engines.a.start();
  await tick(10);
  assert.equal(t.engines.a.state.phase, 'calling');
  assert.equal(t.engines.b.state.phase, 'ringing');
  assert.equal(t.sent[0].env.k === 'call' && t.sent[0].persistent, true); // the offer is kept until delivered
  await t.engines.b.accept();
  await tick(40);
  assert.equal(t.engines.a.state.phase, 'live');
  assert.equal(t.engines.b.state.phase, 'live');
  // connection addresses reach the other side, none lost even though they were produced early
  assert.deepEqual(t.pcs.a!.cands.sort(), ['cand1-b', 'cand2-b']);
  assert.deepEqual(t.pcs.b!.cands.sort(), ['cand1-a', 'cand2-a']);
  t.advance(125_000);
  t.engines.b.hangup();
  await tick(10);
  assert.equal(t.engines.a.state.phase, 'idle');
  assert.equal(t.ended.a[0].outcome, 'answered');
  assert.equal(t.ended.a[0].outgoing, true);
  assert.equal(t.ended.b[0].outcome, 'answered');
  assert.equal(t.ended.b[0].seconds, 125);
  assert.equal(callSummary(t.ended.a[0]), '📞 Voice call · 2:05');
  assert.ok(t.pcs.a!.closed && t.pcs.b!.closed);
});

test('declining ends it for the caller too', async () => {
  const t = pair();
  await t.engines.a.start();
  await tick(10);
  t.engines.b.decline();
  await tick(10);
  assert.equal(t.engines.a.state.phase, 'idle');
  assert.equal(callSummary(t.ended.a[0]), '📞 Call declined');
  assert.equal(callSummary(t.ended.b[0]), '📞 You declined a call');
});

test('nobody answers: it stops ringing on both phones and says missed', async () => {
  const t = pair({ ringMs: 40 });
  await t.engines.a.start();
  await tick(120);
  assert.equal(t.engines.a.state.phase, 'idle');
  assert.equal(t.engines.b.state.phase, 'idle');
  assert.equal(callSummary(t.ended.a[0]), '📞 Call not answered');
  assert.equal(callSummary(t.ended.b[0]), '📞 Missed voice call');
});

test('the caller hangs up while it rings', async () => {
  const t = pair();
  await t.engines.a.start();
  await tick(10);
  t.engines.a.hangup();
  await tick(10);
  assert.equal(t.engines.b.state.phase, 'idle');
  assert.equal(callSummary(t.ended.b[0]), '📞 Missed voice call');
});

test('a call that arrives while you are on another one gets "busy"', async () => {
  const t = pair();
  await t.engines.a.start();
  await tick(10);
  await t.engines.b.accept();
  await tick(40);
  t.engines.b.onEnvelope({ k: 'call', op: 'offer', cid: 'other', ts: 1_000_000, sdp: 'x' });
  assert.equal(t.sent.at(-1)!.env.k === 'call' && (t.sent.at(-1)!.env as any).op, 'busy');
  assert.equal(t.engines.b.state.phase, 'live'); // the call in progress is untouched
});

test('an old offer that was waiting on the server shows up only as a missed call', async () => {
  const t = pair();
  t.engines.b.onEnvelope({ k: 'call', op: 'offer', cid: 'old', ts: 1_000_000 - 5 * 60_000, sdp: 'x' });
  assert.equal(t.engines.b.state.phase, 'idle');
  assert.equal(callSummary(t.ended.b[0]), '📞 Missed voice call');
});

test('microphone not allowed: the call ends cleanly and nothing rings on the other phone', async () => {
  const t = pair({ micDenied: 'a' });
  await t.engines.a.start();
  await tick(10);
  assert.equal(t.engines.a.state.phase, 'idle');
  assert.equal(t.engines.b.state.phase, 'idle');
  assert.equal(t.ended.a[0].outcome, 'failed');
  assert.equal(t.sent.filter((s) => (s.env as any).op === 'offer').length, 0);
});

test('mute and speaker toggles', async () => {
  const t = pair();
  await t.engines.a.start();
  t.engines.a.toggleMute();
  t.engines.a.toggleSpeaker();
  assert.equal(t.engines.a.state.muted, true);
  assert.equal(t.engines.a.state.speaker, true);
  t.engines.a.toggleMute();
  assert.equal(t.engines.a.state.muted, false);
});

test('a connection that drops and does not come back ends the call', async () => {
  const t = pair({ dropMs: 30 });
  await t.engines.a.start();
  await tick(10);
  await t.engines.b.accept();
  await tick(40);
  t.pcs.a!.st!('disconnected');
  await tick(80);
  assert.equal(t.engines.a.state.phase, 'idle');
  assert.equal(t.ended.a[0].outcome, 'answered');
});
