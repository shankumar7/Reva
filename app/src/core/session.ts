// The live chat: connects, encrypts, stores, and tells the screens what changed.
import { RevaClient, type ClientStore, type OutboxItem, type Status } from '../../../shared/client';
import type { Envelope } from '../../../shared/protocol';
import type { Identity } from '../../../shared/crypto';
import * as SecureStore from 'expo-secure-store';
import { getCrypto, rawSodium } from './sodium';
import { Vault } from './storage';
import { Messages, SharedNotes, openDb, wipeDb, type Msg, type SharedNote } from './db';
import * as Images from './images';
import * as FileSystem from 'expo-file-system/legacy';
import type JSZip from 'jszip';
import { IMAGE_EXT, waId, type WaMessage } from './whatsapp';

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
  notes: SharedNote[];
}

type Listener = () => void;

class Session {
  private state: ChatState = { ready: false, status: 'offline', peerOnline: false, peerTyping: false, messages: [], pending: 0, hiAt: 0, notes: [] };
  private listeners = new Set<Listener>();
  private client: RevaClient | null = null;
  private identity: Identity | null = null;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTypingSent = 0;
  viewing = false; // the chat screen is open and in front
  /** Set by the app from Settings. */
  config = { ttlSeconds: 0, saveToGallery: false };
  private purgeTimer: ReturnType<typeof setInterval> | null = null;

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
    await this.purge();
    this.set({ ready: true, messages: await Messages.all(), notes: await SharedNotes.all(), pending: this.client.pending });
    this.purgeTimer = setInterval(() => void this.purge(), 30_000);
    this.client.connect();
    return true;
  }

  stop() {
    if (this.purgeTimer) clearInterval(this.purgeTimer);
    this.purgeTimer = null;
    this.client?.disconnect();
    this.client = null;
    this.set({ ready: false, status: 'offline', peerOnline: false, messages: [], peerTyping: false, notes: [] });
  }

  /** Called when Wi-Fi/mobile data changes or the app returns to the front. */
  networkChanged() {
    this.client?.reconnectNow();
  }

  /** Erase everything on this phone. */
  async panic() {
    this.stop();
    await wipeDb();
    await Images.wipeAll();
    await Vault.wipeAll();
    await SecureStore.deleteItemAsync('k_outbox').catch(() => {});
  }

  private async reload() {
    this.set({ messages: await Messages.all() });
  }

  private newId() {
    return Array.from(rawSodium.randombytes_buf(9) as Uint8Array).map((b: number) => b.toString(16).padStart(2, '0')).join('');
  }

  private async purge() {
    try {
      const gone = await Messages.purgeExpired(Date.now());
      for (const id of gone) await Images.remove(id);
      if (gone.length || this.state.messages.some((m) => m.exp > 0 && m.exp <= Date.now())) await this.reload();
    } catch {
      /* try again in 30 seconds */
    }
  }

  private expFor(ts: number, ttl?: number) {
    return ttl && ttl > 0 ? ts + ttl * 1000 : 0;
  }

  private async onEnvelope(env: Envelope) {
    switch (env.k) {
      case 'msg': {
        await Messages.insert({
          id: env.id, ts: env.ts, mine: false, text: env.text, replyTo: env.replyTo ?? null, state: 3,
          once: !!env.once, seen: this.viewing, exp: this.expFor(env.ts, env.ttl),
        });
        this.client?.send({ k: 'rcpt', ids: [env.id], state: this.viewing ? 'read' : 'delivered' }, 'r' + this.newId());
        this.set({ peerTyping: false });
        break;
      }
      case 'img': {
        const key = await Images.store(env.id, env.data);
        await Messages.insert({
          id: env.id, ts: env.ts, mine: false, kind: 'img', replyTo: env.replyTo ?? null, state: 3, once: !!env.once,
          seen: this.viewing, exp: this.expFor(env.ts, env.ttl), thumb: env.once ? '' : env.thumb, w: env.w, h: env.h, imgKey: key,
        });
        this.client?.send({ k: 'rcpt', ids: [env.id], state: this.viewing ? 'read' : 'delivered' }, 'r' + this.newId());
        this.set({ peerTyping: false });
        if (this.config.saveToGallery && !env.once) void Images.saveToGallery(env.id, key).catch(() => {});
        break;
      }
      case 'viewed':
        await Messages.markViewed(env.id);
        break;
      case 'pin':
        await Messages.pin(env.id, env.on);
        break;
      case 'snote': {
        if (env.del) await SharedNotes.remove(env.id);
        else await SharedNotes.put({ id: env.id, title: env.title, body: env.body, ts: env.ts });
        this.set({ notes: await SharedNotes.all() });
        return;
      }
      case 'edit':
        await Messages.edit(env.id, env.text);
        break;
      case 'del':
        await Messages.remove(env.id);
        await Images.remove(env.id);
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
    const ttl = this.config.ttlSeconds;
    await Messages.insert({ id, ts, mine: true, text: t, replyTo: replyTo ?? null, state: 0, seen: true, exp: this.expFor(ts, ttl) });
    this.client.send({ k: 'msg', id, ts, text: t, replyTo: replyTo ?? undefined, ttl: ttl || undefined }, id);
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
    await Images.remove(id);
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

  /** Send a picture picked from the gallery or taken with the camera. */
  async sendImage(asset: { uri: string; width: number }, once: boolean, replyTo?: string | null) {
    if (!this.client) return;
    const p = await Images.prepare(asset.uri, asset.width);
    const id = this.newId();
    const ts = Date.now();
    const ttl = this.config.ttlSeconds;
    // a view-once picture is not kept on the sender's phone at all
    const key = once ? '' : await Images.store(id, p.data);
    await Messages.insert({
      id, ts, mine: true, kind: 'img', replyTo: replyTo ?? null, state: 0, seen: true, once, thumb: once ? '' : p.thumb,
      w: p.w, h: p.h, imgKey: key, exp: this.expFor(ts, ttl),
    });
    this.client.send({ k: 'img', id, ts, data: p.data, thumb: p.thumb, w: p.w, h: p.h, once, ttl: ttl || undefined, replyTo: replyTo ?? undefined }, id);
    this.set({ pending: this.client.pending });
    await this.reload();
  }

  /** The full picture as base64, or null if it is gone. */
  async imageData(id: string): Promise<string | null> {
    const m = await Messages.get(id);
    if (!m || m.deleted || !m.imgKey) return null;
    try {
      return await Images.load(id, m.imgKey);
    } catch {
      return null;
    }
  }

  /** A view-once picture was looked at and closed: destroy it and tell the sender. */
  async finishOnce(id: string) {
    await Images.remove(id);
    await Messages.markViewed(id);
    this.client?.send({ k: 'viewed', id }, 'v' + this.newId());
    await this.reload();
  }

  async saveImage(id: string): Promise<boolean> {
    const m = await Messages.get(id);
    if (!m || !m.imgKey || m.once) return false;
    try {
      return await Images.saveToGallery(id, m.imgKey);
    } catch {
      return false;
    }
  }

  async starMessage(id: string, on: boolean) {
    await Messages.star(id, on); // stars are private: nothing is sent
    await this.reload();
  }

  /** Brings messages from a WhatsApp export into this phone. Nothing is sent to your partner. */
  async importWhatsApp(
    parsed: WaMessage[], meName: string, zip: JSZip | null, includePhotos: boolean, onProgress: (done: number, total: number) => void,
  ): Promise<{ added: number; photos: number; skipped: number }> {
    let added = 0, photos = 0, skipped = 0;
    const total = parsed.length;
    for (let i = 0; i < parsed.length; i++) {
      const w = parsed[i];
      const id = waId(w, i);
      if (i % 20 === 0) onProgress(i, total);
      if (await Messages.exists(id)) { skipped++; continue; }
      const mine = w.sender === meName;
      try {
        if (w.attachment && IMAGE_EXT.test(w.attachment) && includePhotos && zip && photos < 400) {
          const f = zip.file(w.attachment) ?? zip.file(new RegExp('(^|/)' + w.attachment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'))[0];
          if (f) {
            const b64 = await f.async('base64');
            const tmp = FileSystem.cacheDirectory + 'wa-' + i + '.jpg';
            await FileSystem.writeAsStringAsync(tmp, b64, { encoding: FileSystem.EncodingType.Base64 });
            const p = await Images.prepare(tmp, 2000);
            await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
            const key = await Images.store(id, p.data);
            await Messages.insert({ id, ts: w.ts, mine, kind: 'img', text: w.text, state: 3, seen: true, thumb: p.thumb, w: p.w, h: p.h, imgKey: key });
            added++; photos++;
            continue;
          }
        }
        const text = w.attachment ? (w.text ? w.text + '\n' : '') + '[' + w.attachment + ']' : w.text;
        if (!text.trim()) { skipped++; continue; }
        await Messages.insert({ id, ts: w.ts, mine, text, state: 3, seen: true });
        added++;
      } catch {
        skipped++;
      }
    }
    onProgress(total, total);
    await this.reload();
    return { added, photos, skipped };
  }

  async pinMessage(id: string, on: boolean) {
    await Messages.pin(id, on);
    this.client?.send({ k: 'pin', id, on }, 'p' + this.newId());
    await this.reload();
  }

  async saveNote(id: string | null, title: string, body: string) {
    const n = { id: id ?? this.newId(), title: title.trim() || 'Untitled', body, ts: Date.now() };
    await SharedNotes.put(n);
    this.client?.send({ k: 'snote', ...n }, 'n' + this.newId());
    this.set({ notes: await SharedNotes.all() });
  }

  async deleteNote(id: string) {
    await SharedNotes.remove(id);
    this.client?.send({ k: 'snote', id, title: '', body: '', ts: Date.now(), del: true }, 'n' + this.newId());
    this.set({ notes: await SharedNotes.all() });
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
