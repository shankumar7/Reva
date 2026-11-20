// Everything secret lives in the Android Keystore-backed secure store.
import * as SecureStore from 'expo-secure-store';
import { getCrypto, rawSodium } from './sodium';

export interface Settings {
  theme: string; // 'auto' | theme id
  disguise: string; // disguise id
  notesUnlock: 'search' | 'title'; // how Notes opens the chat
  saveToGallery: boolean; // default for received pictures
  autoLockSeconds: number; // 0 = immediately
  notifications: boolean;
  nickname: string; // what you call your partner (shown in the chat)
  disappear: number; // seconds until new messages disappear, 0 = never
}

export const defaultSettings: Settings = {
  theme: 'auto', disguise: 'Calculator', notesUnlock: 'search', saveToGallery: false,
  autoLockSeconds: 0, notifications: true, nickname: 'Us', disappear: 0,
};

export interface Pairing {
  serverUrl: string;
  token: string; // setup token; erased once both phones are paired
  peerSignPk: string | null;
  registered: boolean;
}

export interface Codes {
  calc?: string; // hashes, never the codes themselves
  notes?: string;
  decoy?: string;
  panic?: string;
}

const K = { seed: 'k_seed', dbkey: 'k_db', settings: 'k_settings', pairing: 'k_pairing', codes: 'k_codes' };
const opt = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

async function getJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const v = await SecureStore.getItemAsync(key);
    return v ? ({ ...fallback, ...JSON.parse(v) } as T) : fallback;
  } catch {
    return fallback;
  }
}
const setJson = (key: string, v: unknown) => SecureStore.setItemAsync(key, JSON.stringify(v), opt);

export const Vault = {
  settings: () => getJson<Settings>(K.settings, defaultSettings),
  saveSettings: (s: Settings) => setJson(K.settings, s),
  pairing: () => getJson<Pairing | null>(K.pairing, null) as Promise<Pairing | null>,
  savePairing: (p: Pairing) => setJson(K.pairing, p),
  codes: () => getJson<Codes>(K.codes, {}),
  saveCodes: (c: Codes) => setJson(K.codes, c),

  async seed(createIfMissing = false): Promise<Uint8Array | null> {
    const c = await getCrypto();
    const v = await SecureStore.getItemAsync(K.seed);
    if (v) return c.unb64(v);
    if (!createIfMissing) return null;
    const id = c.newIdentity();
    await SecureStore.setItemAsync(K.seed, c.b64(id.seed), opt);
    return id.seed;
  },

  /** Random key for the encrypted chat database. */
  async dbKey(): Promise<string> {
    let v = await SecureStore.getItemAsync(K.dbkey);
    if (!v) {
      await getCrypto(); // makes sure libsodium is ready
      v = Array.from(rawSodium.randombytes_buf(32) as Uint8Array).map((b: number) => b.toString(16).padStart(2, '0')).join('');
      await SecureStore.setItemAsync(K.dbkey, v, opt);
    }
    return v;
  },

  async wipeAll() {
    for (const k of Object.values(K)) await SecureStore.deleteItemAsync(k).catch(() => {});
  },
};
