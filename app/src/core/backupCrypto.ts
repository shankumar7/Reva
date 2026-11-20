// Backup file format: "RVB1" + log2(N) + salt(16) + nonce(24) + secretbox(data).
// The key comes from your passphrase with scrypt, so the file is useless without it.
import { scrypt } from '@noble/hashes/scrypt';
import type { createSodiumLite } from './sodiumLite';

type Lite = ReturnType<typeof createSodiumLite>;
const MAGIC = [0x52, 0x56, 0x42, 0x31];
export const DEFAULT_LOG_N = 15;

export function pack(s: Lite, plain: Uint8Array, passphrase: string, logN = DEFAULT_LOG_N): Uint8Array {
  const salt = s.randombytes_buf(16);
  const nonce = s.randombytes_buf(24);
  const key = scrypt(s.from_string(passphrase), salt, { N: 2 ** logN, r: 8, p: 1, dkLen: 32 });
  const ct = s.crypto_secretbox_easy(plain, nonce, key);
  const out = new Uint8Array(5 + 16 + 24 + ct.length);
  out.set(MAGIC, 0);
  out[4] = logN;
  out.set(salt, 5);
  out.set(nonce, 21);
  out.set(ct, 45);
  return out;
}

export function unpack(s: Lite, file: Uint8Array, passphrase: string): Uint8Array {
  if (file.length < 62 || MAGIC.some((b, i) => file[i] !== b)) throw new Error('This is not a backup file.');
  const logN = file[4];
  if (logN < 10 || logN > 18) throw new Error('This backup file is damaged.');
  const key = scrypt(s.from_string(passphrase), file.slice(5, 21), { N: 2 ** logN, r: 8, p: 1, dkLen: 32 });
  try {
    return s.crypto_secretbox_open_easy(file.slice(45), file.slice(21, 45), key);
  } catch {
    throw new Error('Wrong passphrase, or the file is damaged.');
  }
}
