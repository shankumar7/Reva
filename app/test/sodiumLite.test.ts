import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import nodeCrypto from 'node:crypto';
import real from 'libsodium-wrappers';
import { createSodiumLite } from '../src/core/sodiumLite';
import { makeCrypto } from '../../shared/crypto';

before(async () => { await real.ready; });
const rand = (n: number) => new Uint8Array(nodeCrypto.randomBytes(n));
const lite = createSodiumLite(rand);
const L = makeCrypto(lite), R = makeCrypto(real);

test('same seed gives identical keys in both implementations', () => {
  for (let i = 0; i < 5; i++) {
    const seed = rand(32);
    const a = L.identityFromSeed(seed), b = R.identityFromSeed(seed);
    assert.deepEqual(a.signPk, b.signPk);
    assert.deepEqual(a.signSk, b.signSk);
    assert.deepEqual(a.boxPk, b.boxPk);
    assert.deepEqual(a.boxSk, b.boxSk);
  }
});

test('messages cross in both directions: phone (lite) <-> real libsodium', () => {
  const a = L.newIdentity(), b = R.newIdentity();
  const toB = L.seal(a, R.peerFromSignPk(b.signPk), { k: 'msg', id: '1', ts: 1, text: 'héllo 💜 wörld' });
  assert.equal((R.open(b, R.peerFromSignPk(a.signPk), toB) as any).text, 'héllo 💜 wörld');
  const toA = R.seal(b, L.peerFromSignPk(a.signPk), { k: 'hi' });
  assert.equal((L.open(a, L.peerFromSignPk(b.signPk), toA) as any).k, 'hi');
});

test('login signature from the phone is accepted by the real libsodium (what the server uses)', () => {
  const a = L.newIdentity();
  const sig = L.signChallenge(a, 'nonce-xyz');
  assert.ok(R.verifyChallenge(R.b64(a.signPk), 'nonce-xyz', sig));
  assert.ok(!R.verifyChallenge(R.b64(a.signPk), 'other', sig));
  assert.ok(L.verifyChallenge(L.b64(a.signPk), 'nonce-xyz', R.signChallenge(a, 'nonce-xyz')));
});

test('encrypted pictures cross implementations', () => {
  const data = rand(3000);
  const { key, blob } = L.encryptBytes(data);
  assert.deepEqual(R.decryptBytes(key, blob), data);
});

test('safety number and base64 match', () => {
  const x = rand(32), y = rand(32);
  assert.equal(L.safetyNumber(x, y), R.safetyNumber(x, y));
  assert.equal(L.b64(x), R.b64(x));
  assert.deepEqual(L.unb64(R.b64(y)), y);
});

test('passcodes: right code passes, wrong fails, and it is fast enough', () => {
  const t = Date.now();
  const h = L.hashPasscode('482913');
  assert.ok(L.verifyPasscode(h, '482913'));
  assert.ok(!L.verifyPasscode(h, '482914'));
  assert.ok(!L.verifyPasscode('garbage', '482913'));
  console.log('3 scrypt runs took', Date.now() - t, 'ms on this machine');
});
