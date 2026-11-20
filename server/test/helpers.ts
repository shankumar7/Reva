import sodium from 'libsodium-wrappers';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { makeCrypto } from '../../shared/crypto.js';
import { RevaClient, registerDevice, MemoryStore } from '../../shared/client.js';
import type { Envelope } from '../../shared/protocol.js';
import { createServer } from '../src/server.js';

export const TOKEN = 'test-setup-token-1234567890';
export async function setup() {
  await sodium.ready;
  const c = makeCrypto(sodium);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-'));
  const srv = await createServer({ dbPath: path.join(dir, 'c.db'), setupToken: TOKEN, port: 0, host: '127.0.0.1' });
  const url = `ws://127.0.0.1:${srv.port}`;
  return { c, srv, url, dir, sodium };
}
export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function until(fn: () => boolean, ms = 4000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error('timeout waiting for condition');
    await wait(10);
  }
}
export { RevaClient, registerDevice, MemoryStore };
export type { Envelope };
