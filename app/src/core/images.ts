// Pictures: shrink before sending, keep encrypted on the phone, show, save to gallery on request.
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { getCrypto } from './sodium';
import { Disguise } from '../../modules/disguise';

const DIR = (FileSystem.documentDirectory ?? '') + 'img/';
const toUrl = (std: string) => std.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const toStd = (u: string) => {
  let s = u.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return s;
};

export interface Prepared { data: string; thumb: string; w: number; h: number }

/** Shrinks a picture (long side 1280) and makes a small preview. Re-encoding also removes camera location data. */
export async function prepare(uri: string, width: number): Promise<Prepared> {
  const big = await manipulateAsync(uri, width > 1280 ? [{ resize: { width: 1280 } }] : [], { compress: 0.72, format: SaveFormat.JPEG, base64: true });
  const small = await manipulateAsync(uri, [{ resize: { width: 320 } }], { compress: 0.5, format: SaveFormat.JPEG, base64: true });
  return { data: big.base64 ?? '', thumb: small.base64 ?? '', w: big.width, h: big.height };
}

/** Stores the picture on the phone, encrypted. Returns the key (kept in the encrypted database). */
export async function store(id: string, dataStd: string): Promise<string> {
  const c = await getCrypto();
  const { key, blob } = c.encryptBytes(c.unb64(toUrl(dataStd)));
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
  await FileSystem.writeAsStringAsync(DIR + id + '.enc', blob);
  return key;
}

export async function load(id: string, key: string): Promise<string> {
  const c = await getCrypto();
  const blob = await FileSystem.readAsStringAsync(DIR + id + '.enc');
  return toStd(c.b64(c.decryptBytes(key, blob)));
}

export const dataUri = (b64: string) => 'data:image/jpeg;base64,' + b64;

export async function remove(id: string) {
  await FileSystem.deleteAsync(DIR + id + '.enc', { idempotent: true }).catch(() => {});
}

export async function wipeAll() {
  await FileSystem.deleteAsync(DIR, { idempotent: true }).catch(() => {});
}

/** Puts a copy in the phone's gallery. Only ever called when the user asks, or the default setting is on. */
export async function saveToGallery(id: string, key: string): Promise<boolean> {
  const b64 = await load(id, key);
  const tmp = (FileSystem.cacheDirectory ?? '') + 'save-' + id + '.jpg';
  try {
    await FileSystem.writeAsStringAsync(tmp, b64, { encoding: FileSystem.EncodingType.Base64 });
    return await Disguise.saveImage(tmp, 'IMG_' + Date.now() + '.jpg');
  } finally {
    await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
  }
}
