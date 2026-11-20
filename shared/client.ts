// The connection brain used by the phone app (and by the tests).
// It handles: login with the device key, encryption, the offline queue,
// automatic reconnect, and delivery acknowledgements.
import type { Crypto, Identity, PeerKeys } from './crypto.js';
import type { ClientMsg, Envelope, IceServer, ServerMsg } from './protocol.js';

export interface OutboxItem {
  cid: string;
  blob: string;
}

export interface ClientStore {
  loadOutbox(): OutboxItem[];
  saveOutbox(items: OutboxItem[]): void;
}

export class MemoryStore implements ClientStore {
  items: OutboxItem[] = [];
  loadOutbox() {
    return [...this.items];
  }
  saveOutbox(items: OutboxItem[]) {
    this.items = [...items];
  }
}

export type Status = 'offline' | 'connecting' | 'online';

const WINDOW = 4; // messages on the way at once

export interface ClientEvents {
  onStatus?(s: Status): void;
  onPeerOnline?(on: boolean): void;
  /** A decrypted envelope from the other person. */
  onEnvelope?(env: Envelope, serverId: number, ts: number): void | Promise<void>;
  /** Our message left the outbox and reached the server. */
  onSent?(cid: string): void;
  onError?(code: string): void;
}

export interface ClientOptions {
  url: string; // ws://host:port or wss://host
  identity: Identity;
  crypto: Crypto;
  peer?: PeerKeys | null;
  store?: ClientStore;
  events?: ClientEvents;
  WS?: typeof WebSocket; // inject for Node tests
  autoReconnect?: boolean;
}

export class RevaClient {
  status: Status = 'offline';
  peerOnline = false;
  private ws: WebSocket | null = null;
  private store: ClientStore;
  private outbox: OutboxItem[];
  private inflight = new Map<string, number>(); // cid -> when it was sent, so a lost reply cannot block the queue
  private wantOpen = false;
  private ready = false;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private lastPong = 0;
  peer: PeerKeys | null;
  private push: { token: string; kind: 'calculator' | 'notes' | 'chat' } | null = null;

  constructor(private o: ClientOptions) {
    this.store = o.store ?? new MemoryStore();
    this.outbox = this.store.loadOutbox();
    this.peer = o.peer ?? null;
  }

  /** The phone's notification address. It is sent on every connect and never carries chat content. */
  setPush(token: string, kind: 'calculator' | 'notes' | 'chat') {
    this.push = { token, kind };
    if (this.ready) this.raw({ t: 'push', token, kind });
  }

  /** Tell the server to stop sending this phone notifications (used before a wipe). */
  clearPush() {
    this.push = null;
    this.raw({ t: 'push', token: '' });
  }

  setPeer(p: PeerKeys) {
    this.peer = p;
  }

  get pending() {
    return this.outbox.length;
  }

  private setStatus(s: Status) {
    if (this.status !== s) {
      this.status = s;
      this.o.events?.onStatus?.(s);
    }
  }

  connect() {
    this.wantOpen = true;
    this.open();
  }

  private iceWait: ((s: IceServer[]) => void)[] = [];
  /** Asks the server for the call relay addresses. Gives [] if there is no relay or no answer in 4 seconds. */
  requestIce(): Promise<IceServer[]> {
    return new Promise((resolve) => {
      if (!this.ready) return resolve([]);
      const timer = setTimeout(() => resolve([]), 4000);
      this.iceWait.push((s) => { clearTimeout(timer); resolve(s); });
      this.raw({ t: 'ice' });
    });
  }

  disconnect() {
    this.wantOpen = false;
    if (this.timer) clearTimeout(this.timer);
    this.teardown();
    this.setStatus('offline');
  }

  /** Call when the network changes (Wi-Fi to mobile data) or the app returns to the foreground. */
  reconnectNow() {
    if (!this.wantOpen) return;
    this.retry = 0;
    if (this.timer) clearTimeout(this.timer);
    this.teardown();
    this.open();
  }

  private teardown() {
    if (this.ping) clearInterval(this.ping);
    this.ping = null;
    this.ready = false;
    this.inflight.clear();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    }
    this.peerOnline = false;
  }

  private open() {
    if (this.ws) return;
    this.setStatus('connecting');
    const WSImpl = this.o.WS ?? WebSocket;
    let ws: WebSocket;
    try {
      ws = new WSImpl(this.o.url.replace(/\/$/, '') + '/ws');
    } catch {
      return this.scheduleRetry();
    }
    this.ws = ws;
    ws.onmessage = (ev) => this.onMessage(typeof ev.data === 'string' ? ev.data : String(ev.data));
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.teardown();
      this.setStatus('offline');
      this.o.events?.onPeerOnline?.(false);
      this.scheduleRetry();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private scheduleRetry() {
    if (!this.wantOpen || this.o.autoReconnect === false) return;
    const delay = Math.min(15000, 500 * 2 ** this.retry++);
    this.timer = setTimeout(() => this.open(), delay);
  }

  private raw(m: ClientMsg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
  }

  private onMessage(text: string) {
    let m: ServerMsg;
    try {
      m = JSON.parse(text);
    } catch {
      return;
    }
    const c = this.o.crypto;
    switch (m.t) {
      case 'hello': {
        this.raw({ t: 'auth', signPk: c.b64(this.o.identity.signPk), sig: c.signChallenge(this.o.identity, m.nonce) });
        break;
      }
      case 'ready': {
        this.ready = true;
        this.retry = 0;
        this.peerOnline = m.peerOnline;
        this.setStatus('online');
        this.o.events?.onPeerOnline?.(m.peerOnline);
        this.lastPong = Date.now();
        this.ping = setInterval(() => {
          // if the server stopped answering for 40s the connection is dead: reconnect
          if (Date.now() - this.lastPong > 40000) return this.reconnectNow();
          this.raw({ t: 'ping' });
        }, 15000);
        if (this.push) this.raw({ t: 'push', token: this.push.token, kind: this.push.kind });
        this.flush();
        break;
      }
      case 'pong':
        this.lastPong = Date.now();
        break;
      case 'ice':
        for (const f of this.iceWait.splice(0)) f(m.servers ?? []);
        break;
      case 'peer':
        this.peerOnline = m.online;
        this.o.events?.onPeerOnline?.(m.online);
        break;
      case 'sent': {
        this.inflight.delete(m.cid);
        const before = this.outbox.length;
        this.outbox = this.outbox.filter((x) => x.cid !== m.cid);
        if (this.outbox.length !== before) {
          this.store.saveOutbox(this.outbox);
          this.o.events?.onSent?.(m.cid);
        }
        this.flush();
        break;
      }
      case 'msg': {
        if (!this.peer) break;
        let env: Envelope;
        try {
          env = c.open<Envelope>(this.o.identity, this.peer, m.blob);
        } catch {
          // not from our partner or damaged: drop it and clear it from the server
          if (m.id) this.raw({ t: 'ack', ids: [m.id] });
          break;
        }
        // acknowledge only once the app has saved it, so a crash in between cannot lose a message
        const id = m.id;
        void Promise.resolve(this.o.events?.onEnvelope?.(env, id, m.ts))
          .then(() => { if (id) this.raw({ t: 'ack', ids: [id] }); })
          .catch(() => { /* not acknowledged: the server will deliver it again on the next connect */ });
        break;
      }
      case 'error':
        if (m.code === 'rate_limited') {
          // the server dropped what was in flight: try those again in a moment
          this.inflight.clear();
          setTimeout(() => this.flush(), 1200);
        } else if (m.code === 'no_peer' || m.code === 'bad_send') {
          this.inflight.clear();
          setTimeout(() => this.flush(), 5000);
        }
        this.o.events?.onError?.(m.code);
        break;
    }
  }

  /** Sends queued messages a few at a time, so a big batch (an imported chat) never floods the server. */
  private flush() {
    if (!this.ready) return;
    const now = Date.now();
    for (const [cid, at] of this.inflight) if (now - at > 20_000) this.inflight.delete(cid); // no answer for 20 s: send it again
    for (const it of this.outbox) {
      if (this.inflight.size >= WINDOW) return;
      if (this.inflight.has(it.cid)) continue;
      this.inflight.set(it.cid, now);
      this.raw({ t: 'send', cid: it.cid, blob: it.blob });
    }
  }

  /** Encrypt and send. Safe to call offline: it waits in the queue and goes out when back online. */
  send(env: Envelope, cid: string): void {
    if (!this.peer) throw new Error('not paired');
    const blob = this.o.crypto.seal(this.o.identity, this.peer, env);
    this.outbox.push({ cid, blob });
    this.store.saveOutbox(this.outbox);
    this.flush();
  }

  /** A call offer: goes out now (never waits in the queue) and wakes the other phone even if it is asleep. */
  sendUrgent(env: Envelope): boolean {
    if (!this.ready || !this.peer) return false;
    const blob = this.o.crypto.seal(this.o.identity, this.peer, env);
    this.raw({ t: 'send', cid: 'u' + Math.random().toString(36).slice(2), blob, urgent: true });
    return true;
  }

  /** Typing indicators: only delivered if the other phone is online right now. Never queued. */
  sendEphemeral(env: Envelope) {
    if (!this.ready || !this.peer || !this.peerOnline) return;
    const blob = this.o.crypto.seal(this.o.identity, this.peer, env);
    this.raw({ t: 'send', cid: 'e' + Math.random().toString(36).slice(2), blob, ephemeral: true });
  }
}

/** One-time registration of a phone's key with the server (needs the setup token). */
export function registerDevice(
  url: string,
  token: string,
  signPkB64: string,
  WSImpl: typeof WebSocket = WebSocket,
  timeoutMs = 10000,
): Promise<{ ok: true; slot: number } | { ok: false; code: string }> {
  return new Promise((resolve) => {
    let done = false;
    const ws = new WSImpl(url.replace(/\/$/, '') + '/ws');
    const finish = (r: { ok: true; slot: number } | { ok: false; code: string }) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(r);
    };
    const t = setTimeout(() => finish({ ok: false, code: 'timeout' }), timeoutMs);
    ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data)) as ServerMsg;
      if (m.t === 'hello') ws.send(JSON.stringify({ t: 'register', token, signPk: signPkB64 } satisfies ClientMsg));
      else if (m.t === 'registered') finish({ ok: true, slot: m.slot });
      else if (m.t === 'error') finish({ ok: false, code: m.code });
    };
    ws.onerror = () => finish({ ok: false, code: 'network' });
    ws.onclose = () => finish({ ok: false, code: 'network' });
  });
}
