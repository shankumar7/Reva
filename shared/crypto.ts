// End-to-end crypto shared by the app and the tests.
// The server never imports this: it only relays opaque bytes.
// `s` is a ready libsodium instance (libsodium-wrappers on Node, react-native-libsodium on the phone).

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Sodium = any;

export interface Identity {
  seed: Uint8Array; // 32 bytes, the only secret that needs storing
  signPk: Uint8Array;
  signSk: Uint8Array;
  boxPk: Uint8Array;
  boxSk: Uint8Array;
}

export interface PeerKeys {
  signPk: Uint8Array;
  boxPk: Uint8Array;
}

export function makeCrypto(s: Sodium) {
  const b64 = (u: Uint8Array) => s.to_base64(u, s.base64_variants.URLSAFE_NO_PADDING) as string;
  const unb64 = (t: string) => s.from_base64(t, s.base64_variants.URLSAFE_NO_PADDING) as Uint8Array;

  function identityFromSeed(seed: Uint8Array): Identity {
    const kp = s.crypto_sign_seed_keypair(seed);
    return {
      seed,
      signPk: kp.publicKey,
      signSk: kp.privateKey,
      boxPk: s.crypto_sign_ed25519_pk_to_curve25519(kp.publicKey),
      boxSk: s.crypto_sign_ed25519_sk_to_curve25519(kp.privateKey),
    };
  }

  function newIdentity(): Identity {
    return identityFromSeed(s.randombytes_buf(32));
  }

  /** The peer only needs our signing key: the box key is derived from it. */
  function peerFromSignPk(signPk: Uint8Array): PeerKeys {
    return { signPk, boxPk: s.crypto_sign_ed25519_pk_to_curve25519(signPk) };
  }

  /** Encrypt any JSON-able object for the peer. Output = nonce || ciphertext, base64url. */
  function seal(me: Identity, peer: PeerKeys, obj: unknown): string {
    const nonce = s.randombytes_buf(s.crypto_box_NONCEBYTES);
    const msg = s.from_string(JSON.stringify(obj));
    const ct = s.crypto_box_easy(msg, nonce, peer.boxPk, me.boxSk);
    const out = new Uint8Array(nonce.length + ct.length);
    out.set(nonce, 0);
    out.set(ct, nonce.length);
    return b64(out);
  }

  function open<T = any>(me: Identity, peer: PeerKeys, blob: string): T {
    const all = unb64(blob);
    const n = s.crypto_box_NONCEBYTES;
    if (all.length <= n) throw new Error('bad blob');
    const msg = s.crypto_box_open_easy(all.slice(n), all.slice(0, n), peer.boxPk, me.boxSk);
    return JSON.parse(s.to_string(msg)) as T;
  }

  /** Encrypt raw bytes (images) with a fresh random key; the key travels inside a sealed message. */
  function encryptBytes(data: Uint8Array): { key: string; blob: string } {
    const key = s.crypto_secretbox_keygen();
    const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
    const ct = s.crypto_secretbox_easy(data, nonce, key);
    const out = new Uint8Array(nonce.length + ct.length);
    out.set(nonce, 0);
    out.set(ct, nonce.length);
    return { key: b64(key), blob: b64(out) };
  }

  function decryptBytes(key: string, blob: string): Uint8Array {
    const all = unb64(blob);
    const n = s.crypto_secretbox_NONCEBYTES;
    return s.crypto_secretbox_open_easy(all.slice(n), all.slice(0, n), unb64(key));
  }

  /** Server login: sign "reva-auth|<nonce>" with the device key. */
  function signChallenge(me: Identity, nonce: string): string {
    return b64(s.crypto_sign_detached(s.from_string('auth|' + nonce), me.signSk));
  }

  function verifyChallenge(signPkB64: string, nonce: string, sigB64: string): boolean {
    try {
      return s.crypto_sign_verify_detached(unb64(sigB64), s.from_string('auth|' + nonce), unb64(signPkB64));
    } catch {
      return false;
    }
  }

  /** Short number both people can compare out loud to be sure nobody swapped keys. */
  function safetyNumber(a: Uint8Array, b: Uint8Array): string {
    const [x, y] = b64(a) < b64(b) ? [a, b] : [b, a];
    const all = new Uint8Array(x.length + y.length);
    all.set(x, 0);
    all.set(y, x.length);
    const h: Uint8Array = s.crypto_generichash(15, all);
    let out = '';
    for (let i = 0; i < 15; i += 3) {
      const v = (h[i] << 16) | (h[i + 1] << 8) | h[i + 2];
      out += String(v % 100000).padStart(5, '0') + (i < 12 ? ' ' : '');
    }
    return out;
  }

  /** Passcode check without storing the passcode. Uses Argon2 when available, else salted repeated hashing. */
  const hasPwhash = () => typeof s.crypto_pwhash_str === 'function';
  function stretch(code: string, salt: Uint8Array): string {
    let h: Uint8Array = s.crypto_generichash(32, s.from_string(code), salt);
    for (let i = 0; i < 60000; i++) h = s.crypto_generichash(32, h, salt);
    return b64(h);
  }
  function hashPasscode(code: string): string {
    if (hasPwhash()) return s.crypto_pwhash_str(code, s.crypto_pwhash_OPSLIMIT_INTERACTIVE, s.crypto_pwhash_MEMLIMIT_INTERACTIVE);
    const salt = s.randombytes_buf(16);
    return 'g1$' + b64(salt) + '$' + stretch(code, salt);
  }
  function verifyPasscode(hash: string, code: string): boolean {
    try {
      if (hash.startsWith('g1$')) {
        const [, saltB64, h] = hash.split('$');
        return stretch(code, unb64(saltB64)) === h;
      }
      return s.crypto_pwhash_str_verify(hash, code);
    } catch {
      return false;
    }
  }

  return {
    b64, unb64, identityFromSeed, newIdentity, peerFromSignPk, seal, open,
    encryptBytes, decryptBytes, signChallenge, verifyChallenge, safetyNumber,
    hashPasscode, verifyPasscode,
  };
}

export type Crypto = ReturnType<typeof makeCrypto>;
