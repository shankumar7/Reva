// Voice calls. This file is the call's brain: who is ringing, who answered, when it is over.
// It does not touch the phone's audio or network by itself (rtcNative.ts does), so it can be tested on a laptop.
//
// How a call goes: the caller makes an "offer" and sends it, encrypted, through the chat server. The other phone
// shows a ringing screen; Answer makes an "answer" that goes back the same way. The two phones then swap
// connection addresses ("ice") and connect to each other directly; the sound never goes through the server unless
// the networks do not allow a direct line, in which case it goes through your own relay (coturn), still encrypted.
import type { Envelope, IceServer } from '../../../shared/protocol';

export type CallPhase = 'idle' | 'calling' | 'ringing' | 'connecting' | 'live';
export type CallOutcome = 'answered' | 'missed' | 'declined' | 'busy' | 'failed';

export interface CallState {
  phase: CallPhase;
  cid: string;
  outgoing: boolean;
  muted: boolean;
  speaker: boolean;
  startedAt: number; // when the sound started (0 until then)
}
export interface CallEnded { cid: string; outgoing: boolean; outcome: CallOutcome; seconds: number; at: number }

export interface MicLike { setMuted(m: boolean): void; stop(): void }
export interface PcLike {
  createOffer(): Promise<string>;
  createAnswer(): Promise<string>;
  setLocal(type: 'offer' | 'answer', sdp: string): Promise<void>;
  setRemote(type: 'offer' | 'answer', sdp: string): Promise<void>;
  addCandidate(c: string): Promise<void>;
  onCandidate(cb: (c: string) => void): void;
  onState(cb: (s: 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed') => void): void;
  close(): void;
}
export interface RtcDeps {
  getMic(): Promise<MicLike>; // throws if the microphone is not allowed
  createPc(servers: IceServer[], mic: MicLike): PcLike;
  setSpeaker?(on: boolean): void;
  audioSession?(on: boolean): void; // put the phone in "call" sound mode and back
}
export interface CallOptions {
  rtc: RtcDeps;
  getIce(): Promise<IceServer[]>;
  /** persistent: keep trying until delivered (offer, answer, end). Otherwise only if the partner is online now. */
  send(env: Envelope, persistent: boolean): void;
  ringMs?: number;
  staleMs?: number;
  dropMs?: number; // how long a broken connection may recover before the call is ended
  now?: () => number;
  newId?: () => string;
}

const IDLE: CallState = { phase: 'idle', cid: '', outgoing: false, muted: false, speaker: false, startedAt: 0 };

export class CallEngine {
  private st: CallState = { ...IDLE };
  private listeners = new Set<() => void>();
  endedListeners = new Set<(e: CallEnded) => void>();
  private pc: PcLike | null = null;
  private mic: MicLike | null = null;
  private ringTimer: ReturnType<typeof setTimeout> | null = null;
  private dropTimer: ReturnType<typeof setTimeout> | null = null;
  private remoteSet = false;
  private answered = false;
  private pendingRemote: string[] = [];
  private pendingLocal: string[] = [];
  private offerSdp = '';
  private readonly ringMs: number;
  private readonly staleMs: number;
  private readonly dropMs: number;
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(private o: CallOptions) {
    this.ringMs = o.ringMs ?? 45_000;
    this.staleMs = o.staleMs ?? 45_000;
    this.dropMs = o.dropMs ?? 10_000;
    this.now = o.now ?? Date.now;
    this.newId = o.newId ?? (() => Math.random().toString(36).slice(2, 12));
  }

  get state() { return this.st; }
  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  private set(p: Partial<CallState>) { this.st = { ...this.st, ...p }; this.listeners.forEach((l) => l()); }
  get busy() { return this.st.phase !== 'idle'; }

  // ---- things the person does ----

  async start(): Promise<void> {
    if (this.busy) return;
    const cid = this.newId();
    this.reset();
    this.set({ ...IDLE, phase: 'calling', cid, outgoing: true });
    try {
      this.mic = await this.o.rtc.getMic();
      if (this.st.cid !== cid) return this.mic.stop();
      this.o.rtc.audioSession?.(true);
      const servers = await this.o.getIce();
      if (this.st.cid !== cid) return;
      const pc = this.makePc(servers, cid);
      const sdp = await pc.createOffer();
      await pc.setLocal('offer', sdp);
      if (this.st.cid !== cid) return;
      this.o.send({ k: 'call', op: 'offer', cid, ts: this.now(), sdp }, true);
      this.ringTimer = setTimeout(() => this.finish('missed', true), this.ringMs);
    } catch {
      if (this.st.cid === cid) this.finish('failed', true);
    }
  }

  async accept(): Promise<void> {
    const { cid, phase } = this.st;
    if (phase !== 'ringing') return;
    this.stopRing();
    this.set({ phase: 'connecting' });
    try {
      this.mic = await this.o.rtc.getMic();
      if (this.st.cid !== cid) return this.mic.stop();
      this.o.rtc.audioSession?.(true);
      const servers = await this.o.getIce();
      if (this.st.cid !== cid) return;
      const pc = this.makePc(servers, cid);
      await pc.setRemote('offer', this.offerSdp);
      this.remoteSet = true;
      for (const c of this.pendingRemote.splice(0)) await pc.addCandidate(c).catch(() => {});
      const sdp = await pc.createAnswer();
      await pc.setLocal('answer', sdp);
      if (this.st.cid !== cid) return;
      this.answered = true;
      this.o.send({ k: 'call', op: 'answer', cid, ts: this.now(), sdp }, true);
      this.flushLocal();
    } catch {
      if (this.st.cid === cid) this.finish('failed', true);
    }
  }

  decline() {
    if (this.st.phase === 'ringing') this.finish('declined', true);
  }

  hangup() {
    if (this.busy) this.finish(this.st.phase === 'live' ? 'answered' : this.st.outgoing ? 'missed' : 'declined', true);
  }

  toggleMute() {
    const muted = !this.st.muted;
    this.mic?.setMuted(muted);
    this.set({ muted });
  }

  toggleSpeaker() {
    const speaker = !this.st.speaker;
    this.o.rtc.setSpeaker?.(speaker);
    this.set({ speaker });
  }

  // ---- things the partner's phone tells us ----

  onEnvelope(env: Envelope) {
    if (env.k !== 'call') return;
    switch (env.op) {
      case 'offer': {
        if (env.cid === this.st.cid) return; // the same offer again
        const age = this.now() - env.ts;
        if (this.busy) { this.o.send({ k: 'call', op: 'busy', cid: env.cid, ts: this.now() }, false); return; }
        if (age > this.staleMs || age < -this.staleMs) {
          // it reached us late: we were offline or the app was closed
          this.emitEnded({ cid: env.cid, outgoing: false, outcome: 'missed', seconds: 0, at: env.ts });
          return;
        }
        this.reset();
        this.offerSdp = env.sdp ?? '';
        this.set({ ...IDLE, phase: 'ringing', cid: env.cid, outgoing: false });
        this.ringTimer = setTimeout(() => this.finish('missed', false), this.ringMs);
        return;
      }
      case 'answer': {
        if (env.cid !== this.st.cid || this.st.phase !== 'calling' || !this.pc || !env.sdp) return;
        this.stopRing();
        this.answered = true;
        this.set({ phase: 'connecting' });
        const pc = this.pc;
        void pc.setRemote('answer', env.sdp).then(async () => {
          this.remoteSet = true;
          for (const c of this.pendingRemote.splice(0)) await pc.addCandidate(c).catch(() => {});
          this.flushLocal();
        }).catch(() => { if (this.st.cid === env.cid) this.finish('failed', true); });
        return;
      }
      case 'ice': {
        if (env.cid !== this.st.cid || !env.cand) return;
        if (this.remoteSet && this.pc) void this.pc.addCandidate(env.cand).catch(() => {});
        else this.pendingRemote.push(env.cand);
        return;
      }
      case 'busy':
      case 'end': {
        if (env.cid !== this.st.cid || this.st.phase === 'idle') return;
        const live = this.st.phase === 'live';
        const outcome: CallOutcome = live ? 'answered' : env.op === 'busy' ? 'busy' : env.why === 'declined' ? 'declined' : env.why === 'failed' ? 'failed' : 'missed';
        this.finish(outcome, false);
        return;
      }
    }
  }

  /** The chat connection dropped for good (for example the app is closing): leave quietly. */
  abort() {
    if (this.busy) this.finish(this.st.phase === 'live' ? 'answered' : 'failed', true);
  }

  // ---- inside ----

  private makePc(servers: IceServer[], cid: string): PcLike {
    const pc = this.o.rtc.createPc(servers, this.mic!);
    this.pc = pc;
    pc.onCandidate((c) => {
      if (this.st.cid !== cid) return;
      // the caller holds its addresses back until the other phone has answered, so none are lost
      if (this.answered) this.o.send({ k: 'call', op: 'ice', cid, ts: this.now(), cand: c }, false);
      else this.pendingLocal.push(c);
    });
    pc.onState((s) => {
      if (this.st.cid !== cid) return;
      if (s === 'connected') {
        if (this.dropTimer) clearTimeout(this.dropTimer);
        this.dropTimer = null;
        if (this.st.phase !== 'live') this.set({ phase: 'live', startedAt: this.now() });
      } else if (s === 'disconnected') {
        if (!this.dropTimer) this.dropTimer = setTimeout(() => this.finish(this.st.startedAt ? 'answered' : 'failed', true), this.dropMs);
      } else if (s === 'failed') {
        this.finish(this.st.startedAt ? 'answered' : 'failed', true);
      }
    });
    return pc;
  }

  private flushLocal() {
    const cid = this.st.cid;
    for (const c of this.pendingLocal.splice(0)) this.o.send({ k: 'call', op: 'ice', cid, ts: this.now(), cand: c }, false);
  }

  private stopRing() {
    if (this.ringTimer) clearTimeout(this.ringTimer);
    this.ringTimer = null;
  }

  private reset() {
    this.stopRing();
    if (this.dropTimer) clearTimeout(this.dropTimer);
    this.dropTimer = null;
    try { this.pc?.close(); } catch { /* already closed */ }
    try { this.mic?.stop(); } catch { /* already stopped */ }
    this.pc = null;
    this.mic = null;
    this.remoteSet = false;
    this.answered = false;
    this.pendingRemote = [];
    this.pendingLocal = [];
    this.offerSdp = '';
  }

  /** End the call. tell: also tell the other phone. */
  private finish(outcome: CallOutcome, tell: boolean) {
    const s = this.st;
    if (s.phase === 'idle') return;
    const seconds = s.startedAt ? Math.max(0, Math.round((this.now() - s.startedAt) / 1000)) : 0;
    if (tell) {
      const why = outcome === 'declined' ? 'declined' : outcome === 'failed' ? 'failed' : outcome === 'answered' ? 'hangup' : 'missed';
      this.o.send({ k: 'call', op: 'end', cid: s.cid, ts: this.now(), why }, true);
    }
    this.reset();
    this.o.rtc.audioSession?.(false);
    this.set({ ...IDLE });
    this.emitEnded({ cid: s.cid, outgoing: s.outgoing, outcome: outcome === 'answered' && !s.startedAt ? 'missed' : outcome, seconds, at: this.now() });
  }

  private emitEnded(e: CallEnded) {
    this.endedListeners.forEach((l) => l(e));
  }
}

/** The line shown in the chat once a call is over. */
export function callSummary(e: CallEnded): string {
  const m = Math.floor(e.seconds / 60), s = String(e.seconds % 60).padStart(2, '0');
  switch (e.outcome) {
    case 'answered': return `📞 Voice call · ${m}:${s}`;
    case 'missed': return e.outgoing ? '📞 Call not answered' : '📞 Missed voice call';
    case 'declined': return e.outgoing ? '📞 Call declined' : '📞 You declined a call';
    case 'busy': return '📞 Call: line was busy';
    default: return '📞 Call could not connect';
  }
}
