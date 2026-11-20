// The live chat: connects, encrypts, stores, and tells the screens what changed.
import { RevaClient, type ClientStore, type OutboxItem, type Status } from '../../../shared/client';
import type { Envelope } from '../../../shared/protocol';
import type { Identity } from '../../../shared/crypto';
import * as SecureStore from 'expo-secure-store';
import { getCrypto, rawSodium } from './sodium';
import { Vault } from './storage';
import { Albums, Messages, SharedNotes, openDb, wipeDb, type Msg, type SharedNote } from './db';
import * as Images from './images';
import { getPushToken } from './push';
import * as FileSystem from 'expo-file-system/legacy';
import type JSZip from 'jszip';
import { IMAGE_EXT, attachmentLabel, findInZip, makeIds, type WaMessage } from './whatsapp';

/** The queue of messages waiting to be sent. Kept in the encrypted database so it can be big (an imported chat). */
class DbOutbox implements ClientStore {
  private cache: OutboxItem[] = [];
  private chain: Promise<void> = Promise.resolve();

  async init() {
    const d = await openDb();
    try {
      // one-time move from the old place (the secure store)
      const old = await SecureStore.getItemAsync('k_outbox');
      if (old) {
        for (const it of JSON.parse(old) as OutboxItem[]) await d.runAsync('INSERT OR IGNORE INTO outbox (cid, blob) VALUES (?,?)', it.cid, it.blob);
        await SecureStore.deleteItemAsync('k_outbox');
      }
    } catch {
      /* nothing to move */
    }
    this.cache = await d.getAllAsync<OutboxItem>('SELECT cid, blob FROM outbox ORDER BY seq');
  }
  loadOutbox() {
    return [...this.cache];
  }
  saveOutbox(items: OutboxItem[]) {
    const had = new Set(this.cache.map((i) => i.cid));
    const has = new Set(items.map((i) => i.cid));
    const add = items.filter((i) => !had.has(i.cid));
    const del = this.cache.filter((i) => !has.has(i.cid));
    this.cache = [...items];
    if (!add.length && !del.length) return;
    this.chain = this.chain
      .then(async () => {
        const d = await openDb();
        for (const i of del) await d.runAsync('DELETE FROM outbox WHERE cid = ?', i.cid);
        for (const i of add) await d.runAsync('INSERT OR REPLACE INTO outbox (cid, blob) VALUES (?,?)', i.cid, i.blob);
      })
      .catch(() => {});
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
  push: 'unknown' | 'on' | 'denied' | 'unavailable';
  authFailed: boolean; // the server no longer knows this phone
  albums: { name: string; ids: string[] }[];
}

type Listener = () => void;

class Session {
  private state: ChatState = { ready: false, status: 'offline', peerOnline: false, peerTyping: false, messages: [], pending: 0, hiAt: 0, notes: [], push: 'unknown', authFailed: false, albums: [] };
  private listeners = new Set<Listener>();
  private client: RevaClient | null = null;
  private identity: Identity | null = null;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTypingSent = 0;
  viewing = false; // the chat screen is open and in front
  /** Set by the app from Settings. */
  config = { ttlSeconds: 0, saveToGallery: false };
  /** The app listens here for things your partner changed on both phones (the shared start date). */
  hooks: { since?: (date: string) => void } = {};
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

  private starting: Promise<boolean> | null = null;
  start(): Promise<boolean> {
    if (this.client) return Promise.resolve(true);
    if (!this.starting) this.starting = this.doStart().finally(() => { this.starting = null; });
    return this.starting;
  }

  private async doStart(): Promise<boolean> {
    if (this.client) return true;
    const pairing = await Vault.pairing();
    const seed = await Vault.seed(false);
    if (!pairing || !seed || !pairing.peerSignPk) return false;
    const c = await getCrypto();
    this.identity = c.identityFromSeed(seed);
    await openDb();
    const outbox = new DbOutbox();
    await outbox.init();
    this.client = new RevaClient({
      url: pairing.serverUrl,
      identity: this.identity,
      crypto: c,
      peer: c.peerFromSignPk(c.unb64(pairing.peerSignPk)),
      store: outbox,
      events: {
        onStatus: (status) => this.set({ status, pending: this.client?.pending ?? 0, authFailed: status === 'online' ? false : this.state.authFailed }),
        onPeerOnline: (peerOnline) => this.set({ peerOnline, peerTyping: peerOnline ? this.state.peerTyping : false }),
        onEnvelope: (env) => this.receive(env),
        onError: (code) => { if (code === 'auth_failed') this.set({ authFailed: true }); },
        onSent: (cid) => {
          void Messages.setState(cid, 1).then(() => this.reload());
          this.set({ pending: this.client?.pending ?? 0 });
        },
      },
    });
    await this.purge();
    this.set({ ready: true, messages: await Messages.all(), notes: await SharedNotes.all(), albums: await Albums.all(), pending: this.client.pending });
    this.purgeTimer = setInterval(() => void this.purge(), 30_000);
    this.client.connect();
    return true;
  }

  stop() {
    if (this.purgeTimer) clearInterval(this.purgeTimer);
    this.purgeTimer = null;
    this.client?.disconnect();
    this.client = null;
    this.set({ ready: false, status: 'offline', peerOnline: false, messages: [], peerTyping: false, notes: [], albums: [] });
  }

  /** Called when Wi-Fi/mobile data changes or the app returns to the front. */
  networkChanged() {
    this.client?.reconnectNow();
  }

  /** Erase everything on this phone. */
  async panic() {
    this.client?.clearPush();
    await new Promise((r) => setTimeout(r, 400)); // let the message leave
    this.stop();
    await wipeDb();
    await Images.wipeAll();
    await Vault.wipeAll();
    await SecureStore.deleteItemAsync('k_outbox').catch(() => {});
  }

  private async reload() {
    this.set({ messages: await Messages.all() });
  }

  private reloadTimer: ReturnType<typeof setTimeout> | null = null;
  /** For bursts (an imported chat): reload the list once a moment, not after every batch. */
  private reloadSoon() {
    if (this.reloadTimer) return;
    this.reloadTimer = setTimeout(() => { this.reloadTimer = null; void this.reload(); }, 200);
  }

  /** Incoming messages are handled one at a time, in order, so an edit can never overtake the message it edits. */
  private rx: Promise<void> = Promise.resolve();
  private receive(env: Envelope): Promise<void> {
    const run = this.rx.then(() => this.onEnvelope(env));
    this.rx = run.catch(() => {}); // one failure must not block the ones after it
    return run;
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
        if (await Messages.exists(env.id)) break; // delivered twice: keep the first copy and its key
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
      case 'aud': {
        if (await Messages.exists(env.id)) break;
        const key = await Images.store(env.id, env.data);
        await Messages.insert({
          id: env.id, ts: env.ts, mine: false, kind: 'aud', replyTo: env.replyTo ?? null, state: 3, seen: this.viewing,
          exp: this.expFor(env.ts, env.ttl), w: env.dur, imgKey: key,
        });
        this.client?.send({ k: 'rcpt', ids: [env.id], state: this.viewing ? 'read' : 'delivered' }, 'r' + this.newId());
        this.set({ peerTyping: false });
        break;
      }
      case 'imp': {
        // your partner imported an old chat: add it here too (same ids, so nothing doubles up)
        for (const it of env.items) {
          await Messages.insert({ id: it.id, ts: it.ts, mine: it.m === 0, text: it.text, state: 3, seen: true });
        }
        break;
      }
      case 'impimg': {
        if (await Messages.exists(env.id)) break;
        const key = await Images.store(env.id, env.data);
        await Messages.insert({ id: env.id, ts: env.ts, mine: env.m === 0, kind: 'img', text: env.text, state: 3, seen: true, thumb: env.thumb, w: env.w, h: env.h, imgKey: key });
        break;
      }
      case 'stk': {
        if (await Messages.exists(env.id)) break;
        await Messages.insert({ id: env.id, ts: env.ts, mine: false, kind: 'stk', text: env.sid, replyTo: env.replyTo ?? null, state: 3, seen: this.viewing, exp: this.expFor(env.ts, env.ttl) });
        this.client?.send({ k: 'rcpt', ids: [env.id], state: this.viewing ? 'read' : 'delivered' }, 'r' + this.newId());
        this.set({ peerTyping: false });
        break;
      }
      case 'since':
        if (/^\d{4}-\d{2}-\d{2}$/.test(env.date)) this.hooks.since?.(env.date);
        return;
      case 'album': {
        if (env.on) await Albums.add(env.id, env.name.slice(0, 40));
        else await Albums.remove(env.id, env.name);
        this.set({ albums: await Albums.all() });
        return;
      }
      case 'viewed': {
        const m = await Messages.get(env.id);
        if (m?.mine) await Messages.markViewed(env.id); // only my own view-once pictures can be marked opened by them
        break;
      }
      case 'pin':
        await Messages.pin(env.id, env.on);
        break;
      case 'snote': {
        if (env.del) await SharedNotes.remove(env.id);
        else await SharedNotes.put({ id: env.id, title: env.title, body: env.body, ts: env.ts });
        this.set({ notes: await SharedNotes.all() });
        return;
      }
      case 'edit': {
        const m = await Messages.get(env.id);
        if (m && !m.mine) await Messages.edit(env.id, env.text); // your partner can only change their own messages
        break;
      }
      case 'del': {
        const m = await Messages.get(env.id);
        if (m && !m.mine) {
          await Messages.remove(env.id);
          await Images.remove(env.id);
        }
        break;
      }
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
    this.reloadSoon();
  }

  async sendText(text: string, replyTo?: string | null): Promise<boolean> {
    const t = text.trim();
    if (!t || !this.client) return false;
    const id = this.newId();
    const ts = Date.now();
    const ttl = this.config.ttlSeconds;
    await Messages.insert({ id, ts, mine: true, text: t, replyTo: replyTo ?? null, state: 0, seen: true, exp: this.expFor(ts, ttl) });
    this.client.send({ k: 'msg', id, ts, text: t, replyTo: replyTo ?? undefined, ttl: ttl || undefined }, id);
    this.set({ pending: this.client.pending });
    await this.reload();
    return true;
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

  /** Send a recorded voice note (an m4a file on this phone). */
  async sendVoice(fileUri: string, seconds: number, replyTo?: string | null) {
    if (!this.client) return;
    const data = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
    const id = this.newId();
    const ts = Date.now();
    const ttl = this.config.ttlSeconds;
    const key = await Images.store(id, data);
    await Messages.insert({ id, ts, mine: true, kind: 'aud', replyTo: replyTo ?? null, state: 0, seen: true, w: Math.round(seconds), imgKey: key, exp: this.expFor(ts, ttl) });
    this.client.send({ k: 'aud', id, ts, data, dur: Math.round(seconds), ttl: ttl || undefined, replyTo: replyTo ?? undefined }, id);
    this.set({ pending: this.client.pending });
    await this.reload();
  }

  /** The full picture (or voice note) as base64, or null if it is gone. */
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

  /** Only for the browser preview used to check the design: shows sample messages. */
  seedForPreview(p: Partial<ChatState>) {
    this.set({ ready: true, status: 'online', peerOnline: true, ...p });
  }

  /** Turn on notifications for this phone (asks Android for permission the first time). */
  async enablePush(kind: 'calculator' | 'notes' | 'chat') {
    const r = await getPushToken();
    if (r.ok) {
      this.client?.setPush(r.token, kind);
      this.set({ push: 'on' });
    } else {
      this.set({ push: r.reason });
    }
  }

  /** Stop notifications for this phone (the server forgets its address). */
  disablePush() {
    this.client?.clearPush();
    this.set({ push: 'unknown' });
  }

  /** Send a sticker from the built-in library. */
  async sendSticker(sid: string, replyTo?: string | null): Promise<boolean> {
    if (!this.client) return false;
    const id = this.newId();
    const ts = Date.now();
    const ttl = this.config.ttlSeconds;
    await Messages.insert({ id, ts, mine: true, kind: 'stk', text: sid, replyTo: replyTo ?? null, state: 0, seen: true, exp: this.expFor(ts, ttl) });
    this.client.send({ k: 'stk', id, ts, sid, ttl: ttl || undefined, replyTo: replyTo ?? undefined }, id);
    this.set({ pending: this.client.pending });
    await this.reload();
    return true;
  }

  /** Tell your partner's phone the day you started, so both count the same days. */
  shareSince(date: string) {
    this.client?.send({ k: 'since', date }, 'sn' + this.newId());
  }

  async addToAlbum(msgId: string, name: string) {
    const n = name.trim().slice(0, 40);
    if (!n) return;
    await Albums.add(msgId, n);
    this.client?.send({ k: 'album', id: msgId, name: n, on: true }, 'al' + this.newId());
    this.set({ albums: await Albums.all() });
  }

  async removeFromAlbum(msgId: string, name: string) {
    await Albums.remove(msgId, name);
    this.client?.send({ k: 'album', id: msgId, name, on: false }, 'al' + this.newId());
    this.set({ albums: await Albums.all() });
  }

  async starMessage(id: string, on: boolean) {
    await Messages.star(id, on); // stars are private: nothing is sent
    await this.reload();
  }

  /**
   * Brings messages from a WhatsApp export into this phone. With `share` on, the same messages are also sent
   * (encrypted, in small batches) to your partner's phone, so both of you have the whole history.
   */
  async importWhatsApp(
    parsed: WaMessage[], meName: string, zip: JSZip | null,
    opts: { photos: boolean; share: boolean; sharePhotos: boolean },
    onProgress: (done: number, total: number, phase: string) => void,
  ): Promise<{ added: number; photos: number; skipped: number; shared: number }> {
    const c = await getCrypto();
    const me = this.myKey ? c.b64(this.myKey) : 'me';
    const them = this.peerKey ? c.b64(this.peerKey) : 'them';
    const ids = makeIds(parsed, (m) => (m.sender === meName ? me : them));
    let added = 0, photos = 0, skipped = 0, shared = 0;
    let batch: { id: string; ts: number; m: 0 | 1; text: string }[] = [];
    const flushBatch = () => {
      if (!batch.length || !this.client) return;
      this.client.send({ k: 'imp', items: batch }, 'imp' + this.newId());
      shared += batch.length;
      batch = [];
    };
    const total = parsed.length;
    for (let i = 0; i < total; i++) {
      const w = parsed[i];
      const id = ids[i];
      if (i % 20 === 0) onProgress(i, total, 'Importing');
      const mine = w.sender === meName;
      const had = await Messages.exists(id);
      try {
        if (w.attachment && IMAGE_EXT.test(w.attachment) && opts.photos && zip && photos < 400) {
          const f = findInZip(zip.file(/.*/).filter((x) => !x.dir), w.attachment);
          if (f) {
            const b64 = await f.async('base64');
            const tmp = FileSystem.cacheDirectory + 'wa-' + i + '.jpg';
            await FileSystem.writeAsStringAsync(tmp, b64, { encoding: FileSystem.EncodingType.Base64 });
            const p = await Images.prepare(tmp, 0);
            await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
            if (!had) {
              const key = await Images.store(id, p.data);
              await Messages.insert({ id, ts: w.ts, mine, kind: 'img', text: w.text, state: 3, seen: true, thumb: p.thumb, w: p.w, h: p.h, imgKey: key });
              added++;
            }
            photos++;
            if (opts.share && opts.sharePhotos && this.client) {
              this.client.send({ k: 'impimg', id, ts: w.ts, m: mine ? 1 : 0, text: w.text, data: p.data, thumb: p.thumb, w: p.w, h: p.h }, 'ii' + this.newId());
              shared++;
            }
            continue;
          }
        }
        const text = w.deleted ? '[Deleted message]' : w.attachment ? (w.text ? w.text + '\n' : '') + attachmentLabel(w.attachment) : w.text;
        if (!text.trim()) { skipped++; continue; }
        if (!had) { await Messages.insert({ id, ts: w.ts, mine, text, state: 3, seen: true }); added++; } else skipped++;
        if (opts.share) {
          batch.push({ id, ts: w.ts, m: mine ? 1 : 0, text });
          if (batch.length >= 120) flushBatch();
        }
      } catch {
        skipped++;
      }
    }
    flushBatch();
    onProgress(total, total, 'Done');
    this.set({ pending: this.client?.pending ?? 0 });
    await this.reload();
    return { added, photos, skipped, shared };
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
