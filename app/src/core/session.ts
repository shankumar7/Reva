// The live chat: connects, encrypts, stores, and tells the screens what changed.
import { RevaClient, type ClientStore, type OutboxItem, type Status } from '../../../shared/client';
import type { Envelope } from '../../../shared/protocol';
import type { Identity } from '../../../shared/crypto';
import * as SecureStore from 'expo-secure-store';
import { getCrypto, rawSodium } from './sodium';
import { Vault } from './storage';
import { Messages, openDb, wipeDb, type Msg } from './db';

class SecureOutbox implements ClientStore {
  private cache: OutboxItem[] = [];
  async init() {
    try {
      const v = await SecureStore.getItemAsync('k_outbox');
      this.cache = v ? JSON.parse(v) : [];
    } catch {
      this.cache = [];
    }
  }
  loadOutbox() {
    return [...this.cache];
  }
  saveOutbox(items: OutboxItem[]) {
    this.cache = [...items];
    // SecureStore has a size limit; the outbox only ever holds a few small texts
    SecureStore.setItemAsync('k_outbox', JSON.stringify(items.slice(-200))).catch(() => {});
  }
}

export interface ChatState {
  ready: boolean;
  status: Status;
  peerOnline: boolean;
  peerTyping: boolean;
  messages: Msg[];
  pending: number;
  hiAt: number; // last "thinking of you" received
}

type Listener = () => void;

class Session {
  private state: ChatState = { ready: false, status: 'offline', peerOnline: false, peerTyping: false, messages: [], pending: 0, hiAt: 0 };
  private listeners = new Set<Listener>();
  private client: RevaClient | null = null;
  private identity: Identity | null = null;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTypingSent = 0;
  viewing = false; // the chat screen is open and in front

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getState = () => this.state;
  private set(p: Partial<ChatState>) {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((l) => l());
  }

  async start(): Promise<boolean> {
    if (this.client) return true;
    const pairing = await Vault.pairing();
    const seed = await Vault.seed(false);
    if (!pairing || !seed || !pairing.peerSignPk) return false;
    const c = await getCrypto();
    this.identity = c.identityFromSeed(seed);
    await openDb();
    const outbox = new SecureOutbox();
    await outbox.init();
    this.client = new RevaClient({
      url: pairing.serverUrl,
      identity: this.identity,
      crypto: c,
      peer: c.peerFromSignPk(c.unb64(pairing.peerSignPk)),
      store: outbox,
      events: {
        onStatus: (status) => this.set({ status, pending: this.client?.pending ?? 0 }),
        onPeerOnline: (peerOnline) => this.set({ peerOnline, peerTyping: peerOnline ? this.state.peerTyping : false }),
        onEnvelope: (env) => void this.onEnvelope(env),
        onSent: (cid) => {
          void Messages.setState(cid, 1).then(() => this.reload());
          this.set({ pending: this.client?.pending ?? 0 });
        },
      },
    });
    this.set({ ready: true, messages: await Messages.all(), pending: this.client.pending });
    this.client.connect();
    return true;
  }

  stop() {
    this.client?.disconnect();
    this.client = null;
    this.set({ ready: false, status: 'offline', peerOnline: false, messages: [], peerTyping: false });
  }

  /** Called when Wi-Fi/mobile data changes or the app returns to the front. */
  networkChanged() {
    this.client?.reconnectNow();
  }

  /** Erase everything on this phone. */
  async panic() {
    this.stop();
    await wipeDb();
    await Vault.wipeAll();
    await SecureStore.deleteItemAsync('k_outbox').catch(() => {});
  }

  private async reload() {
    this.set({ messages: await Messages.all() });
  }

  private newId() {
    return Array.from(rawSodium.randombytes_buf(9) as Uint8Array).map((b: number) => b.toString(16).padStart(2, '0')).join('');
  }

  private async onEnvelope(env: Envelope) {
    switch (env.k) {
      case 'msg': {
        await Messages.insert({
          id: env.id, ts: env.ts, mine: false, text: env.text, replyTo: env.replyTo ?? null, state: 3,
          edited: false, deleted: false, rMine: null, rTheirs: null, once: !!env.once, seen: this.viewing,
        });
        this.client?.send({ k: 'rcpt', ids: [env.id], state: this.viewing ? 'read' : 'delivered' }, 'r' + this.newId());
        this.set({ peerTyping: false });
        break;
      }
      case 'edit':
        await Messages.edit(env.id, env.text);
        break;
      case 'del':
        await Messages.remove(env.id);
        break;
      case 'react':
        await Messages.react(env.id, 'theirs', env.emoji);
        break;
      case 'rcpt':
        for (const id of env.ids) await Messages.setState(id, env.state === 'read' ? 3 : 2);
        break;
      case 'typing':
        if (this.typingTimer) clearTimeout(this.typingTimer);
        this.set({ peerTyping: env.on });
        if (env.on) this.typingTimer = setTimeout(() => this.set({ peerTyping: false }), 5000);
        return;
      case 'hi':
        this.set({ hiAt: Date.now() });
        return;
    }
    await this.reload();
  }

  async sendText(text: string, replyTo?: string | null) {
    const t = text.trim();
    if (!t || !this.client) return;
    const id = this.newId();
    const ts = Date.now();
    await Messages.insert({
      id, ts, mine: true, text: t, replyTo: replyTo ?? null, state: 0, edited: false, deleted: false,
      rMine: null, rTheirs: null, once: false, seen: true,
    });
    this.client.send({ k: 'msg', id, ts, text: t, replyTo: replyTo ?? undefined }, id);
    this.set({ pending: this.client.pending });
    await this.reload();
  }

  async editMine(id: string, text: string) {
    const m = await Messages.get(id);
    const t = text.trim();
    if (!m || !m.mine || !t) return;
    await Messages.edit(id, t);
    this.client?.send({ k: 'edit', id, text: t }, 'e' + this.newId());
    await this.reload();
  }

  async deleteMine(id: string) {
    const m = await Messages.get(id);
    if (!m || !m.mine) return;
    await Messages.remove(id);
    this.client?.send({ k: 'del', id }, 'd' + this.newId());
    await this.reload();
  }

  async react(id: string, emoji: string | null) {
    await Messages.react(id, 'mine', emoji);
    this.client?.send({ k: 'react', id, emoji }, 'x' + this.newId());
    await this.reload();
  }

  thinkingOfYou() {
    this.client?.send({ k: 'hi' }, 'h' + this.newId());
  }

  /** Call as the user types; only sends at most once every 3 seconds. */
  typing(on: boolean) {
    const now = Date.now();
    if (on && now - this.lastTypingSent < 3000) return;
    this.lastTypingSent = on ? now : 0;
    this.client?.sendEphemeral({ k: 'typing', on });
  }

  /** The chat screen came to the front: tell the other phone what has been read. */
  async markRead() {
    const ids = await Messages.unseenIds();
    if (!ids.length) return;
    await Messages.markSeen();
    this.client?.send({ k: 'rcpt', ids, state: 'read' }, 'rr' + this.newId());
    await this.reload();
  }

  async search(q: string) {
    return q.trim() ? Messages.search(q.trim()) : [];
  }

  get peerKey() {
    return this.client?.peer?.signPk ?? null;
  }
  get myKey() {
    return this.identity?.signPk ?? null;
  }
}

export const session = new Session();
