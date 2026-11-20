import { test } from 'node:test';
import assert from 'node:assert/strict';
import sodium from 'libsodium-wrappers';
import { makeCrypto } from '../../shared/crypto.js';

await sodium.ready;
const c = makeCrypto(sodium);

test('two people can read each other, strangers cannot', () => {
  const a = c.newIdentity(), b = c.newIdentity(), eve = c.newIdentity();
  const blob = c.seal(a, c.peerFromSignPk(b.signPk), { k: 'msg', id: '1', ts: 1, text: 'hello love' });
  assert.ok(!blob.includes('hello'));
  const got = c.open(b, c.peerFromSignPk(a.signPk), blob);
  assert.equal((got as any).text, 'hello love');
  assert.throws(() => c.open(eve, c.peerFromSignPk(a.signPk), blob));
  assert.throws(() => c.open(b, c.peerFromSignPk(eve.signPk), blob));
});

test('tampered ciphertext is rejected', () => {
  const a = c.newIdentity(), b = c.newIdentity();
  const blob = c.seal(a, c.peerFromSignPk(b.signPk), { k: 'hi' });
  const bytes = c.unb64(blob);
  bytes[bytes.length - 1] ^= 1;
  assert.throws(() => c.open(b, c.peerFromSignPk(a.signPk), c.b64(bytes)));
});

test('same seed gives the same identity', () => {
  const a = c.newIdentity();
  const again = c.identityFromSeed(a.seed);
  assert.deepEqual(again.signPk, a.signPk);
  assert.deepEqual(again.boxPk, a.boxPk);
});

test('images: encrypt bytes, decrypt with key, wrong key fails', () => {
  const data = sodium.randombytes_buf(5000);
  const { key, blob } = c.encryptBytes(data);
  assert.deepEqual(c.decryptBytes(key, blob), data);
  assert.throws(() => c.decryptBytes(c.encryptBytes(data).key, blob));
});

test('login challenge: right key passes, wrong key and replay fail', () => {
  const a = c.newIdentity(), b = c.newIdentity();
  const sig = c.signChallenge(a, 'nonce1');
  assert.ok(c.verifyChallenge(c.b64(a.signPk), 'nonce1', sig));
  assert.ok(!c.verifyChallenge(c.b64(b.signPk), 'nonce1', sig));
  assert.ok(!c.verifyChallenge(c.b64(a.signPk), 'nonce2', sig));
});

test('safety number is the same on both phones', () => {
  const a = c.newIdentity(), b = c.newIdentity();
  assert.equal(c.safetyNumber(a.signPk, b.signPk), c.safetyNumber(b.signPk, a.signPk));
});

test('passcode hash verifies only the right code', () => {
  const h = c.hashPasscode('482913');
  assert.ok(c.verifyPasscode(h, '482913'));
  assert.ok(!c.verifyPasscode(h, '482914'));
});
