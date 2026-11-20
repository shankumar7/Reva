import { test } from 'node:test';
import assert from 'node:assert/strict';
import nodeCrypto from 'node:crypto';
import { createSodiumLite } from '../src/core/sodiumLite';
import { pack, unpack } from '../src/core/backupCrypto';

const s = createSodiumLite((n) => new Uint8Array(nodeCrypto.randomBytes(n)));
const enc = (t: string) => new TextEncoder().encode(t);

test('backup round trip, wrong passphrase, tampering', () => {
  const plain = enc(JSON.stringify({ hello: 'wörld 💜', n: Array.from({ length: 1000 }, (_, i) => i) }));
  const f = pack(s, plain, 'correct horse battery', 10);
  assert.deepEqual(unpack(s, f, 'correct horse battery'), plain);
  assert.throws(() => unpack(s, f, 'wrong passphrase'), /Wrong passphrase/);
  const bad = f.slice(); bad[bad.length - 3] ^= 1;
  assert.throws(() => unpack(s, bad, 'correct horse battery'), /Wrong passphrase/);
  assert.throws(() => unpack(s, enc('not a backup at all, definitely not a backup file....................'), 'x'), /not a backup/);
});

test('the file does not contain readable text', () => {
  const f = pack(s, enc('my secret message about the surprise party'), 'passphrase1', 10);
  assert.ok(!Buffer.from(f).includes(Buffer.from('surprise')));
});
