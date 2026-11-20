// Reads a WhatsApp "Export chat" text file.
//
// What WhatsApp writes (it differs by phone, app version and language, and there is no official spec):
//   Android  31/12/2023, 21:41 - Name: message          12/31/23, 9:41 PM - Name: message
//   iPhone   [31/12/2023, 21:41:05] Name: message       (a hidden left-to-right mark starts every line)
//   Others   31.12.23, 21:41 - ...   2023-12-31, 21:41 - ...   2023/12/31 下午9:41 - ...   ٣١/١٢/٢٠٢٣، ٩:٤١ م - ...
// A message can run over several lines; system lines ("Messages and calls are end-to-end encrypted") have no
// "Name:"; attachments appear as "IMG-...jpg (file attached)" or "<attached: ...>"; WhatsApp caps an export at
// about 40,000 messages (10,000 with media), and exports are not always in time order.

export interface WaMessage {
  ts: number; // local time, in milliseconds. Messages in the same minute get +1 ms each so their order is kept.
  sender: string;
  text: string;
  attachment?: string; // file name inside the export zip, if the message was a photo, video etc.
  deleted?: boolean;
  edited?: boolean;
}

export interface WaParse {
  messages: WaMessage[];
  senders: string[];
  dateOrder: 'dmy' | 'mdy';
  ambiguous: boolean; // nothing in the file proves day-first or month-first, so check the preview
  skipped: number; // system lines and notices that were left out
  outOfOrder: number; // how many messages were earlier than the one before them (just informational)
}

// Invisible marks (left-to-right etc.), the narrow no-break space some phones put before AM/PM, zero-width spaces.
const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g;
const SPACES = /[    ]/g;

/** Digits from other scripts (Arabic-Indic, Persian, Devanagari, Bengali) to 0-9. Same length, so positions still line up. */
function asciiDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹०-९০-৯]/g, (c) => {
    const code = c.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
    if (code >= 0x0966 && code <= 0x096f) return String(code - 0x0966);
    return String(code - 0x09e6);
  });
}

const DATE = /^\[?(\d{1,4})[-/.]\s?(\d{1,2})[-/.]\s?(\d{1,4})/;
const TIME = /(\d{1,2})[:.](\d{2})(?::(\d{2}))?/;

/** 'pm' or 'am' if the text around the time says so, in English, Spanish, Hindi, Arabic, Chinese, Japanese, Korean or Greek. */
function meridiem(s: string): 'am' | 'pm' | null {
  const x = s.toLowerCase().replace(/[\s.]/g, '');
  if (!x) return null;
  if (/(pm|μμ|م|अपराह्न|下午|午後|午后|오후|вечера)/.test(x)) return 'pm';
  if (/(am|πμ|ص|पूर्वाह्न|上午|午前|오전|утра)/.test(x)) return 'am';
  return null;
}

interface Head { a: number; b: number; c: number; hh: number; mm: number; ss: number; ap: 'am' | 'pm' | null; yearFirst: boolean; rest: string }

/** If this line starts a message, split it into date, time and the rest. Otherwise null. */
function parseHeader(line: string): Head | null {
  const head = asciiDigits(line.slice(0, 80));
  const d = DATE.exec(head);
  if (!d) return null;
  const bracket = head[0] === '[';
  const after = head.slice(d[0].length);
  const t = TIME.exec(after);
  if (!t) return null;
  const gap = after.slice(0, t.index); // ", " or " at " or " 下午"
  if (gap.length > 14 || /\d/.test(gap)) return null;
  const tail = head.slice(d[0].length + t.index + t[0].length); // " PM - Name: hi", "] Name: hi", " - ..."
  // where the header ends: "]" for iPhone, " - " for Android, or ": " in some older layouts
  const m = bracket ? /^([^\]]{0,16})\]\s?/.exec(tail) : /^([^\n]{0,16}?)(?:\s[-–—]\s|:\s)/.exec(tail);
  if (!m) return null;
  const token = m[1];
  if (/\d/.test(token)) return null;
  const a = +d[1], b = +d[2], c = +d[3];
  const yearFirst = d[1].length === 4 || a > 31;
  let hh = +t[1];
  const mm = +t[2], ss = t[3] ? +t[3] : 0;
  const ap = meridiem(gap + ' ' + token);
  if (mm > 59 || ss > 59 || hh > 24) return null;
  if (ap) { // 12-hour clock
    if (hh > 12) return null;
    if (ap === 'pm' && hh < 12) hh += 12;
    if (ap === 'am' && hh === 12) hh = 0;
  }
  const consumed = d[0].length + t.index + t[0].length + m[0].length;
  return { a, b, c, hh, mm, ss, ap, yearFirst, rest: line.slice(consumed) };
}

/** Day-first or month-first? Three clues, strongest first (the same ideas the best open-source parser uses). */
function detectOrder(heads: Head[]): { order: 'dmy' | 'mdy'; proven: boolean } {
  const dmy = heads.filter((h) => !h.yearFirst);
  if (!dmy.length) return { order: 'dmy', proven: true };
  // 1. a first number above 12 can only be a day; a second above 12 can only be a day too
  if (dmy.some((h) => h.a > 12)) return { order: 'dmy', proven: true };
  if (dmy.some((h) => h.b > 12)) return { order: 'mdy', proven: true };
  // 2. inside one year the month never goes down, so the part that goes down is the day
  const byYear = new Map<number, Head[]>();
  for (const h of dmy) byYear.set(h.c, [...(byYear.get(h.c) ?? []), h]);
  let firstDrops = false, secondDrops = false;
  for (const g of byYear.values()) for (let i = 1; i < g.length; i++) {
    if (g[i].a < g[i - 1].a) firstDrops = true;
    if (g[i].b < g[i - 1].b) secondDrops = true;
  }
  if (firstDrops && !secondDrops) return { order: 'dmy', proven: false };
  if (secondDrops && !firstDrops) return { order: 'mdy', proven: false };
  // 3. the day moves around more than the month does
  let va = 0, vb = 0;
  const uniq: Head[] = [];
  for (const h of dmy) if (!uniq.length || uniq[uniq.length - 1].a !== h.a || uniq[uniq.length - 1].b !== h.b || uniq[uniq.length - 1].c !== h.c) uniq.push(h);
  for (let i = 1; i < uniq.length; i++) { va += Math.abs(uniq[i].a - uniq[i - 1].a); vb += Math.abs(uniq[i].b - uniq[i - 1].b); }
  if (va > vb) return { order: 'dmy', proven: false };
  if (vb > va) return { order: 'mdy', proven: false };
  return { order: 'dmy', proven: false }; // nothing to go on: day first is the common one
}

function toMs(h: Head, order: 'dmy' | 'mdy'): number {
  let y: number, mo: number, d: number;
  if (h.yearFirst) { y = h.a; mo = h.b; d = h.c; }
  else {
    y = h.c < 100 ? 2000 + h.c : h.c;
    if (order === 'dmy') { d = h.a; mo = h.b; } else { mo = h.a; d = h.b; }
  }
  return new Date(y, mo - 1, d, h.hh === 24 ? 0 : h.hh, h.mm, h.ss).getTime();
}

// ---- what a message line can be besides ordinary text ----
const ATTACH_ANGLE = /^<[^<>:]{1,30}:\s*(.+)>$/; // <attached: 0001-PHOTO-2023.jpg>
const ATTACH_PAREN = /^(.+?\.[A-Za-z0-9]{2,5})\s[(<][^()<>]{1,40}[)>]$/; // IMG-20231231-WA0001.jpg (file attached)
const OMITTED = /^<?(media|image|video|audio|sticker|gif|document|contact card|voice message|video note|photo)s? omitted>?$/i;
const DELETED = /^(you deleted this message|this message was deleted|you deleted this message\.|this message was deleted\.)$/i;
const EDITED = /\s*<?this message was edited>?$/i;
const NOISE = /^(messages and calls are end-to-end encrypted|messages to this (chat|group) and calls are now secured|your messages and calls are (end-to-end encrypted|secured)|this chat is end-to-end encrypted)/i;
const SYSTEM_NAME = /changed|added|removed|left|joined|created|deleted|security|subject|icon|description|number|invited|turned|set |updated/i;

export type AttachKind = 'image' | 'audio' | 'video' | 'file';
export function attachmentKind(name: string): AttachKind {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(ext)) return 'image';
  if (['opus', 'aac', 'm4a', 'mp3', 'amr', 'ogg', 'wav', '3ga'].includes(ext)) return 'audio';
  if (['mp4', '3gp', 'mov', 'mkv', 'avi', 'webm'].includes(ext)) return 'video';
  return 'file';
}
export function attachmentLabel(name: string): string {
  const k = attachmentKind(name);
  return k === 'image' ? '[Photo]' : k === 'audio' ? '[Voice message]' : k === 'video' ? '[Video]' : `[File: ${name}]`;
}
export const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

export function parseWhatsApp(raw: string, forceOrder?: 'dmy' | 'mdy'): WaParse {
  const lines = raw.replace(INVISIBLE, '').replace(SPACES, ' ').split(/\r\n|\r|\n/);

  // 1. find the lines that start a message
  const heads: { i: number; h: Head }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]) continue;
    const h = parseHeader(lines[i]);
    if (h) heads.push({ i, h });
  }

  // 2. day-first or month-first
  const { order: detected, proven } = detectOrder(heads.map((x) => x.h));
  const order = forceOrder ?? detected;

  // 3. build messages; lines that are not headers continue the previous message
  type Raw = { ts: number; sender: string; lines: string[] };
  const rawMsgs: Raw[] = [];
  let skipped = 0;
  let cur: Raw | null = null;
  let k = 0;
  for (let i = 0; i < lines.length; i++) {
    if (k < heads.length && heads[k].i === i) {
      const { h } = heads[k++];
      const sep = h.rest.indexOf(': ');
      if (sep <= 0 || sep > 60) { skipped++; cur = null; continue; } // a system line, no "Name: "
      cur = { ts: toMs(h, order), sender: h.rest.slice(0, sep).trim(), lines: [h.rest.slice(sep + 2)] };
      rawMsgs.push(cur);
    } else if (cur) {
      cur.lines.push(lines[i]);
    }
  }

  // 4. system lines that look like messages: a sender seen once with a sentence for a name
  const counts = new Map<string, number>();
  for (const m of rawMsgs) counts.set(m.sender, (counts.get(m.sender) ?? 0) + 1);
  const realSender = (s: string) => {
    if (counts.size <= 3) return true;
    const n = counts.get(s) ?? 0;
    return n >= 2 || !(s.length > 30 || SYSTEM_NAME.test(s));
  };

  // 5. tidy each message
  const messages: WaMessage[] = [];
  const minuteSeq = new Map<number, number>();
  let outOfOrder = 0, prev = 0;
  for (const r of rawMsgs) {
    if (!realSender(r.sender)) { skipped++; continue; }
    let text = r.lines.join('\n').replace(/\s+$/, '');
    const first = text.split('\n')[0].trim();
    if (NOISE.test(first)) { skipped++; continue; }
    const m: WaMessage = { ts: r.ts, sender: r.sender, text };
    if (DELETED.test(first)) { m.deleted = true; m.text = ''; }
    else {
      if (EDITED.test(text)) { text = text.replace(EDITED, ''); m.edited = true; m.text = text; }
      const f = text.split('\n')[0].trim();
      const a = ATTACH_ANGLE.exec(f) ?? ATTACH_PAREN.exec(f);
      if (a) { m.attachment = a[1].trim(); m.text = text.split('\n').slice(1).join('\n'); }
      else if (OMITTED.test(f)) m.text = '[' + f.replace(/[<>]/g, '') + ']';
    }
    // keep the order of messages that share a minute
    const base = Math.floor(m.ts / 60_000) * 60_000;
    const n = minuteSeq.get(base) ?? 0;
    minuteSeq.set(base, n + 1);
    m.ts += Math.min(n, 59_999);
    if (m.ts < prev) outOfOrder++;
    prev = Math.max(prev, m.ts);
    messages.push(m);
  }

  const senders = [...new Set(messages.map((m) => m.sender))];
  return { messages, senders, dateOrder: order, ambiguous: !proven, skipped, outOfOrder };
}

/**
 * Stable ids that do not depend on contact names, so the same chat imported on both phones lines up:
 * the id comes from the time, who wrote it (by key), the text, and which repeat of that it is.
 */
export function makeIds(messages: WaMessage[], authorKey: (m: WaMessage) => string): string[] {
  const seen = new Map<string, number>();
  return messages.map((m) => {
    const base = m.ts + '|' + authorKey(m) + '|' + m.text + '|' + (m.attachment ? 'att' : '') + (m.deleted ? 'del' : '');
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    let h = 5381;
    const s = base + '|' + n;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    let h2 = 52711;
    for (let i = s.length - 1; i >= 0; i--) h2 = ((h2 << 5) + h2 + s.charCodeAt(i)) | 0;
    return 'wa' + (h >>> 0).toString(36) + (h2 >>> 0).toString(36);
  });
}
