// Opens a big .zip (a WhatsApp export with pictures can be hundreds of MB) without loading it into memory:
// read the table of contents at the end of the file, then read only the pieces that are needed, one at a time.
// "reader" gives bytes from a position in the file; on the phone it reads straight from the file on disk.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pako = require('pako') as { inflateRaw(data: Uint8Array): Uint8Array };

export type RangeReader = (position: number, length: number) => Promise<Uint8Array>;
export interface ZipEntry { name: string; size: number; packed: number; method: number; offset: number; flags: number }
export interface ZipArchive { entries: ZipEntry[]; read(e: ZipEntry): Promise<Uint8Array> }

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u64 = (b: Uint8Array, o: number) => u32(b, o) + u32(b, o + 4) * 4294967296;

export function decodeUtf8(b: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(b);
  let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return decodeURIComponent(escape(s));
}
function decodeName(b: Uint8Array, utf8: boolean): string {
  if (utf8) return decodeUtf8(b);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

export async function openZip(size: number, reader: RangeReader): Promise<ZipArchive> {
  if (size < 22) throw new Error('That file is not a zip.');
  // 1. find the end-of-directory record (it sits in the last 22 bytes + an optional comment of up to 65535)
  const tailLen = Math.min(size, 65557);
  const tail = await reader(size - tailLen, tailLen);
  let e = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 5 && tail[i + 3] === 6) { e = i; break; }
  }
  if (e < 0) throw new Error('That does not look like a complete zip file.');
  let count = u16(tail, e + 10), cdSize = u32(tail, e + 12), cdOffset = u32(tail, e + 16);
  // 2. big zips (ZIP64) keep the real numbers in another record
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    if (e >= 20 && u32(tail, e - 20) === 0x07064b50) {
      const z64At = u64(tail, e - 20 + 8);
      const z = await reader(z64At, 56);
      if (u32(z, 0) !== 0x06064b50) throw new Error('Damaged zip file.');
      count = u64(z, 32); cdSize = u64(z, 40); cdOffset = u64(z, 48);
    }
  }
  if (cdOffset + cdSize > size) throw new Error('Damaged zip file.');
  // 3. the table of contents
  const cd = await reader(cdOffset, cdSize);
  const entries: ZipEntry[] = [];
  let p = 0;
  while (p + 46 <= cd.length && u32(cd, p) === 0x02014b50) {
    const flags = u16(cd, p + 8), method = u16(cd, p + 10);
    let packed = u32(cd, p + 20), usize = u32(cd, p + 24), offset = u32(cd, p + 42);
    const nameLen = u16(cd, p + 28), extraLen = u16(cd, p + 30), commentLen = u16(cd, p + 32);
    const name = decodeName(cd.subarray(p + 46, p + 46 + nameLen), (flags & 0x800) !== 0);
    // ZIP64 extra field holds whichever numbers did not fit in 32 bits, in this order
    let x = p + 46 + nameLen;
    const xEnd = x + extraLen;
    while (x + 4 <= xEnd) {
      const id = u16(cd, x), len = u16(cd, x + 2);
      if (id === 1) {
        let q = x + 4;
        if (usize === 0xffffffff) { usize = u64(cd, q); q += 8; }
        if (packed === 0xffffffff) { packed = u64(cd, q); q += 8; }
        if (offset === 0xffffffff) { offset = u64(cd, q); q += 8; }
      }
      x += 4 + len;
    }
    if (!name.endsWith('/')) entries.push({ name, size: usize, packed, method, offset, flags });
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (!entries.length && count > 0) throw new Error('Damaged zip file.');

  return {
    entries,
    async read(en) {
      if (en.flags & 1) throw new Error('This zip is password protected.');
      const head = await reader(en.offset, 30);
      if (u32(head, 0) !== 0x04034b50) throw new Error('Damaged zip file.');
      const start = en.offset + 30 + u16(head, 26) + u16(head, 28);
      const data = await reader(start, en.packed);
      if (en.method === 0) return data;
      if (en.method === 8) return pako.inflateRaw(data);
      throw new Error('This zip uses a compression the app cannot read.');
    },
  };
}

// ---- base64 <-> bytes (small and quick; used for pieces, never for a whole big file) ----
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Uint8Array(256).fill(255);
for (let i = 0; i < ALPHA.length; i++) LOOKUP[ALPHA.charCodeAt(i)] = i;

export function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)], b = LOOKUP[clean.charCodeAt(i + 1)];
    const c = i + 2 < clean.length ? LOOKUP[clean.charCodeAt(i + 2)] : 0, d = i + 3 < clean.length ? LOOKUP[clean.charCodeAt(i + 3)] : 0;
    if (o < out.length) out[o++] = (a << 2) | (b >> 4);
    if (o < out.length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (o < out.length) out[o++] = ((c & 3) << 6) | d;
  }
  return out;
}

export function bytesToBase64(b: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < b.length; i += 3 * 4096) {
    let s = '';
    const end = Math.min(b.length, i + 3 * 4096);
    for (let j = i; j < end; j += 3) {
      const n = (b[j] << 16) | ((b[j + 1] ?? 0) << 8) | (b[j + 2] ?? 0);
      s += ALPHA[(n >> 18) & 63] + ALPHA[(n >> 12) & 63] + (j + 1 < b.length ? ALPHA[(n >> 6) & 63] : '=') + (j + 2 < b.length ? ALPHA[n & 63] : '=');
    }
    parts.push(s);
  }
  return parts.join('');
}
