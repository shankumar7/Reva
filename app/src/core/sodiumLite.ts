// Pure-JavaScript crypto with the same function names as libsodium, for the phone.
// Why: libsodium's phone wrapper needs a native part that did not load on this Android/Expo version,
// and WebAssembly does not exist on the Hermes engine. This uses small audited libraries instead
// (tweetnacl for box/secretbox, noble for ed25519 conversion, BLAKE2b and scrypt), and is checked
// against the real libsodium used by the server in test/sodiumLite.test.ts.
import nacl from 'tweetnacl';
import { ed25519, edwardsToMontgomeryPub, edwardsToMontgomeryPriv } from '@noble/curves/ed25519';
import { blake2b } from '@noble/hashes/blake2b';
import { scrypt } from '@noble/hashes/scrypt';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const URLSAFE_NO_PADDING = 7; // libsodium's constant for this variant

function toB64(u: Uint8Array): string {
  let out = '';
  for (let i = 0; i < u.length; i += 3) {
    const n = (u[i] << 16) | ((u[i + 1] ?? 0) << 8) | (u[i + 2] ?? 0);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    if (i + 1 < u.length) out += ALPHABET[(n >> 6) & 63];
    if (i + 2 < u.length) out += ALPHABET[n & 63];
  }
  return out;
}
function fromB64(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let acc = 0, bits = 0, j = 0;
  for (const ch of clean) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error('bad base64');
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (acc >> bits) & 255;
    }
  }
  return out;
}
function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}
function utf8Decode(u: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u.length; ) {
    const b = u[i++];
    let c: number;
    if (b < 0x80) c = b;
    else if (b < 0xe0) c = ((b & 31) << 6) | (u[i++] & 63);
    else if (b < 0xf0) { c = ((b & 15) << 12) | ((u[i] & 63) << 6) | (u[i + 1] & 63); i += 2; }
    else { c = ((b & 7) << 18) | ((u[i] & 63) << 12) | ((u[i + 1] & 63) << 6) | (u[i + 2] & 63); i += 3; }
    s += String.fromCodePoint(c);
  }
  return s;
}
const concat = (a: Uint8Array, b: Uint8Array) => {
  const o = new Uint8Array(a.length + b.length);
  o.set(a, 0);
  o.set(b, a.length);
  return o;
};
const SCRYPT = { N: 2 ** 12, r: 8, p: 1, dkLen: 32 };
function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export function createSodiumLite(rand: (n: number) => Uint8Array) {
  return {
    ready: Promise.resolve(),
    base64_variants: { URLSAFE_NO_PADDING },
    to_base64: (u: Uint8Array, _variant?: number) => toB64(u),
    from_base64: (s: string, _variant?: number) => fromB64(s),
    from_string: utf8Encode,
    to_string: utf8Decode,
    randombytes_buf: (n: number) => rand(n),

    crypto_sign_seed_keypair(seed: Uint8Array) {
      const publicKey = ed25519.getPublicKey(seed);
      return { publicKey, privateKey: concat(seed, publicKey), keyType: 'ed25519' };
    },
    crypto_sign_ed25519_pk_to_curve25519: (pk: Uint8Array) => edwardsToMontgomeryPub(pk),
    crypto_sign_ed25519_sk_to_curve25519: (sk: Uint8Array) => edwardsToMontgomeryPriv(sk.slice(0, 32)),
    crypto_sign_detached: (msg: Uint8Array, sk: Uint8Array) => ed25519.sign(msg, sk.slice(0, 32)),
    crypto_sign_verify_detached: (sig: Uint8Array, msg: Uint8Array, pk: Uint8Array) => ed25519.verify(sig, msg, pk),

    crypto_box_NONCEBYTES: 24,
    crypto_box_easy: (msg: Uint8Array, nonce: Uint8Array, pk: Uint8Array, sk: Uint8Array) => nacl.box(msg, nonce, pk, sk),
    crypto_box_open_easy(ct: Uint8Array, nonce: Uint8Array, pk: Uint8Array, sk: Uint8Array) {
      const r = nacl.box.open(ct, nonce, pk, sk);
      if (!r) throw new Error('decryption failed');
      return r;
    },

    crypto_secretbox_NONCEBYTES: 24,
    crypto_secretbox_keygen: () => rand(32),
    crypto_secretbox_easy: (msg: Uint8Array, nonce: Uint8Array, key: Uint8Array) => nacl.secretbox(msg, nonce, key),
    crypto_secretbox_open_easy(ct: Uint8Array, nonce: Uint8Array, key: Uint8Array) {
      const r = nacl.secretbox.open(ct, nonce, key);
      if (!r) throw new Error('decryption failed');
      return r;
    },

    crypto_generichash: (len: number, data: Uint8Array) => blake2b(data, { dkLen: len }),

    // passcode hashing (scrypt); the format is our own
    crypto_pwhash_OPSLIMIT_INTERACTIVE: 0,
    crypto_pwhash_MEMLIMIT_INTERACTIVE: 0,
    crypto_pwhash_str(code: string) {
      const salt = rand(16);
      return 'sc1$' + toB64(salt) + '$' + toB64(scrypt(utf8Encode(code), salt, SCRYPT));
    },
    crypto_pwhash_str_verify(hash: string, code: string) {
      const [tag, salt, h] = hash.split('$');
      if (tag !== 'sc1' || !salt || !h) return false;
      return sameBytes(scrypt(utf8Encode(code), fromB64(salt), SCRYPT), fromB64(h));
    },
  };
}
