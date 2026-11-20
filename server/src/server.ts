import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import sodium from 'libsodium-wrappers';
import { makeCrypto } from '../../shared/crypto.js';
import type { ClientMsg, ServerMsg } from '../../shared/protocol.js';
import { Store } from './db.js';
import { latestBackup, makeBackup } from './backup.js';
import type { Fcm } from './fcm.js';

export interface Options {
  dbPath: string;
  setupToken: string;
  port?: number;
  host?: string;
  updatesDir?: string;
  backupDir?: string;
  backupKey?: string; // 64 hex characters
  fcm?: Fcm | null; // free push notifications, optional
  maxMsgBytes?: number;
}

interface Conn {
  ws: WebSocket;
  nonce: string;
  slot: number | null;
  signPk: string | null;
  ip: string;
  tokens: number; // rate limit bucket
  last: number;
}

const RATE_PER_SEC = 20;
const BURST = 60;

export async function createServer(opts: Options) {
  await sodium.ready;
  const c = makeCrypto(sodium);
  const store = new Store(opts.dbPath);
  const maxBytes = opts.maxMsgBytes ?? 8 * 1024 * 1024;
  const conns = new Set<Conn>();
  const tokenBuf = Buffer.from(opts.setupToken);

  const badLogins = new Map<string, { n: number; until: number }>();
  const ipBlocked = (ip: string) => (badLogins.get(ip)?.until ?? 0) > Date.now();
  const noteBad = (ip: string) => {
    const e = badLogins.get(ip) ?? { n: 0, until: 0 };
    e.n += 1;
    if (e.n >= 5) {
      e.until = Date.now() + 15 * 60_000;
      e.n = 0;
    }
    badLogins.set(ip, e);
  };

  const send = (ws: WebSocket, m: ServerMsg) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  };
  const other = (slot: number) => (slot === 1 ? 2 : 1);
  const online = (slot: number) => [...conns].find((x) => x.slot === slot);
  const peerPk = (slot: number) => store.devices().find((d) => d.slot === other(slot))?.signPk ?? null;

  function deliverPending(cn: Conn) {
    if (cn.slot == null) return;
    for (const m of store.pending(cn.slot)) send(cn.ws, { t: 'msg', id: m.id, blob: m.blob, ts: m.ts });
  }

  // at most one wake-up per 20 seconds, however many messages arrive
  const lastPush = new Map<number, number>();
  function wake(slot: number) {
    if (!opts.fcm) return;
    const p = store.getPush(slot);
    if (!p) return;
    if (Date.now() - (lastPush.get(slot) ?? 0) < 20_000) return;
    lastPush.set(slot, Date.now());
    void opts.fcm.send(p.token, p.kind).then((r) => {
      if (r === 'gone') store.setPush(slot, null, null);
    });
  }

  function announce(slot: number) {
    // tell the other phone this one went on/offline, and its key once known
    const peer = online(other(slot));
    if (peer) send(peer.ws, { t: 'peer', online: !!online(slot), signPk: store.devices().find((d) => d.slot === slot)?.signPk ?? null });
  }

  // ---- HTTP: health, plus authenticated update files ----
  const updatesDir = opts.updatesDir;
  const httpServer = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    res.setHeader('Cache-Control', 'no-store');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('ok');
    }
    const isUpdate = url.pathname === '/update/latest.json' || url.pathname === '/update/app.apk';
    const isBackup = url.pathname === '/backup/latest.enc';
    if (isUpdate || isBackup) {
      // Only a registered device may ask: it signs the current minute.
      const pk = String(req.headers['x-device'] ?? '');
      const sig = String(req.headers['x-sig'] ?? '');
      const minute = String(req.headers['x-minute'] ?? '');
      const ip = String(req.socket.remoteAddress);
      const fresh = Math.abs(Date.now() / 60000 - Number(minute)) <= 2;
      const scope = isBackup ? 'backup|' : 'update|';
      if (ipBlocked(ip) || !fresh || !store.bySignPk(pk) || !c.verifyChallenge(pk, scope + minute, sig)) {
        noteBad(ip);
        res.writeHead(401);
        return res.end();
      }
      let file: string | null = null;
      if (isBackup) file = opts.backupDir ? latestBackup(opts.backupDir) : null;
      else if (updatesDir) file = path.join(updatesDir, url.pathname.endsWith('.json') ? 'latest.json' : 'app.apk');
      if (!file || !fs.existsSync(file)) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, {
        'Content-Type': file.endsWith('.json') ? 'application/json' : 'application/octet-stream',
        'Content-Length': fs.statSync(file).size,
      });
      return fs.createReadStream(file).pipe(res);
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: maxBytes });

  wss.on('connection', (ws, req) => {
    const ip = String(req.socket.remoteAddress);
    if (ipBlocked(ip)) {
      ws.close(1008, 'blocked');
      return;
    }
    const cn: Conn = {
      ws, ip, slot: null, signPk: null, last: Date.now(), tokens: BURST,
      nonce: c.b64(sodium.randombytes_buf(24)),
    };
    conns.add(cn);
    send(ws, { t: 'hello', nonce: cn.nonce, registrationOpen: store.registrationOpen() });

    ws.on('message', (raw) => {
      // rate limit
      const now = Date.now();
      cn.tokens = Math.min(BURST, cn.tokens + ((now - cn.last) / 1000) * RATE_PER_SEC);
      cn.last = now;
      if (cn.tokens < 1) return send(ws, { t: 'error', code: 'rate_limited' });
      cn.tokens -= 1;

      let m: ClientMsg;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return send(ws, { t: 'error', code: 'bad_json' });
      }

      if (m.t === 'ping') return send(ws, { t: 'pong' });

      if (m.t === 'register') {
        if (ipBlocked(cn.ip)) return ws.close(1008, 'blocked');
        const given = Buffer.from(String(m.token ?? ''));
        const okToken = given.length === tokenBuf.length && crypto.timingSafeEqual(given, tokenBuf);
        if (!okToken || typeof m.signPk !== 'string' || m.signPk.length > 100) {
          noteBad(cn.ip);
          return send(ws, { t: 'error', code: 'bad_token' });
        }
        // Re-registering the same key is fine (lost the reply); a new key needs an open slot.
        const existing = store.bySignPk(m.signPk);
        const slot = existing ? existing.slot : store.register(m.signPk);
        if (slot == null) return send(ws, { t: 'error', code: 'registration_closed' });
        return send(ws, { t: 'registered', slot });
      }

      if (m.t === 'auth') {
        if (ipBlocked(cn.ip)) return ws.close(1008, 'blocked');
        const dev = store.bySignPk(m.signPk);
        if (!dev || !c.verifyChallenge(m.signPk, cn.nonce, m.sig)) {
          noteBad(cn.ip);
          send(ws, { t: 'error', code: 'auth_failed' });
          return ws.close(1008, 'auth');
        }
        // a second connection from the same device replaces the first
        for (const o of conns) if (o !== cn && o.slot === dev.slot) o.ws.close(1000, 'replaced');
        cn.slot = dev.slot;
        cn.signPk = dev.signPk;
        send(ws, { t: 'ready', peerSignPk: peerPk(dev.slot), peerOnline: !!online(other(dev.slot)) });
        announce(dev.slot);
        deliverPending(cn);
        return;
      }

      if (cn.slot == null) return send(ws, { t: 'error', code: 'not_authed' });

      if (m.t === 'send') {
        if (typeof m.blob !== 'string' || typeof m.cid !== 'string' || m.cid.length > 64) {
          return send(ws, { t: 'error', code: 'bad_send' });
        }
        const to = other(cn.slot);
        if (!store.devices().some((d) => d.slot === to)) return send(ws, { t: 'error', code: 'no_peer' });
        if (m.ephemeral) {
          const peer = online(to);
          if (peer) send(peer.ws, { t: 'msg', id: 0, blob: m.blob, ts: Date.now() });
          return send(ws, { t: 'sent', cid: m.cid, id: null });
        }
        const id = store.enqueue(to, m.blob);
        send(ws, { t: 'sent', cid: m.cid, id });
        const peer = online(to);
        if (peer) send(peer.ws, { t: 'msg', id, blob: m.blob, ts: Date.now() });
        else wake(to);
        return;
      }

      if (m.t === 'push') {
        if (typeof m.token === 'string' && m.token.length > 20 && m.token.length < 400) {
          store.setPush(cn.slot, m.token, m.kind === 'notes' ? 'notes' : 'calculator');
        }
        return;
      }

      if (m.t === 'ack') {
        if (Array.isArray(m.ids)) store.ack(cn.slot, m.ids.filter((n) => Number.isInteger(n)).slice(0, 500));
        return;
      }
    });

    ws.on('close', () => {
      conns.delete(cn);
      if (cn.slot != null) announce(cn.slot);
    });
    ws.on('error', () => ws.terminate());
  });

  const pruneTimer = setInterval(() => store.prune(), 6 * 3600_000);
  pruneTimer.unref();

  // one encrypted backup a day, plus one shortly after start-up
  let backupTimer: ReturnType<typeof setInterval> | null = null;
  if (opts.backupDir && opts.backupKey) {
    const run = () => {
      try {
        makeBackup(store, opts.backupDir!, opts.backupKey!);
      } catch (e) {
        console.error('backup failed:', (e as Error).message);
      }
    };
    setTimeout(run, 30_000).unref();
    backupTimer = setInterval(run, 24 * 3600_000);
    backupTimer.unref();
  }

  await new Promise<void>((r) => httpServer.listen(opts.port ?? 8080, opts.host ?? '0.0.0.0', r));
  const addr = httpServer.address();
  const port = typeof addr === 'object' && addr ? addr.port : opts.port ?? 8080;

  return {
    port,
    store,
    async close() {
      clearInterval(pruneTimer);
      if (backupTimer) clearInterval(backupTimer);
      for (const x of conns) x.ws.terminate();
      await new Promise((r) => wss.close(() => r(null)));
      await new Promise((r) => httpServer.close(() => r(null)));
      store.close();
    },
  };
}
