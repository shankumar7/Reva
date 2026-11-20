// Reads a WhatsApp "Export chat" text file. Handles Android and iPhone layouts, 12 and 24 hour clocks,
// day-first and month-first dates, multi-line messages, and system lines.

export interface WaMessage {
  ts: number;
  sender: string;
  text: string;
  attachment?: string; // file name inside the export zip, if the message was a photo, video etc.
}

export interface WaParse {
  messages: WaMessage[];
  senders: string[];
  dateOrder: 'dmy' | 'mdy';
  ambiguous: boolean; // every date could be read both ways
  skipped: number; // system lines such as "Messages are end-to-end encrypted"
}

// Invisible marks WhatsApp puts in files, and the narrow no-break space some phones put before AM/PM.
const CLEAN = /[‎‏‪-‮﻿]/g;
const HEADER =
  /^\[?(\d{1,4})[\/.\-](\d{1,2})[\/.\-](\d{1,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?)?\]?\s*(?:[-–—]\s*)?(.*)$/;

const ATTACH_PATTERNS: RegExp[] = [
  /^<attached:\s*(.+?)>$/i, // iPhone
  /^(.+?)\s+\((?:file attached|datei angehängt|archivo adjunto)\)$/i, // Android
];
const OMITTED = /^<(?:media|image|video|audio|sticker|gif|document) omitted>$/i;

function toDate(a: number, b: number, c: number, order: 'dmy' | 'mdy', hh: number, mm: number, ss: number, ap?: string): number {
  let day: number, month: number, year: number;
  if (a > 31) { year = a; month = b; day = c; } // 2023-12-31
  else {
    year = c < 100 ? 2000 + c : c;
    if (order === 'dmy') { day = a; month = b; } else { month = a; day = b; }
  }
  let h = hh;
  if (ap) {
    const pm = /p/i.test(ap);
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  return new Date(year, month - 1, day, h, mm, ss).getTime();
}

export function parseWhatsApp(raw: string, forceOrder?: 'dmy' | 'mdy'): WaParse {
  const lines = raw.replace(CLEAN, '').replace(/[  ]/g, ' ').split(/\r?\n/);

  // 1. find the header lines and decide day/month order from all of them
  type Head = { i: number; a: number; b: number; c: number; hh: number; mm: number; ss: number; ap?: string; rest: string };
  const heads: Head[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = HEADER.exec(lines[i]);
    if (!m) continue;
    heads.push({ i, a: +m[1], b: +m[2], c: +m[3], hh: +m[4], mm: +m[5], ss: m[6] ? +m[6] : 0, ap: m[7], rest: m[8] });
  }
  let dayFirstEvidence = 0, monthFirstEvidence = 0;
  for (const h of heads) {
    if (h.a > 31) continue;
    if (h.a > 12) dayFirstEvidence++;
    if (h.b > 12) monthFirstEvidence++;
  }
  const ambiguous = dayFirstEvidence === 0 && monthFirstEvidence === 0;
  const dateOrder: 'dmy' | 'mdy' = forceOrder ?? (monthFirstEvidence > dayFirstEvidence ? 'mdy' : 'dmy');

  // 2. build messages; lines that are not headers continue the previous message
  const messages: WaMessage[] = [];
  let skipped = 0;
  let cur: WaMessage | null = null;
  let headIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const h = heads[headIdx];
    if (h && h.i === i) {
      headIdx++;
      const sep = h.rest.indexOf(': ');
      if (sep <= 0 || sep > 60) { // no "Name: " so it is a system line
        skipped++;
        cur = null;
        continue;
      }
      cur = { ts: toDate(h.a, h.b, h.c, dateOrder, h.hh, h.mm, h.ss, h.ap), sender: h.rest.slice(0, sep).trim(), text: h.rest.slice(sep + 2) };
      messages.push(cur);
    } else if (cur) {
      cur.text += '\n' + lines[i];
    }
  }

  // 3. tidy the text, spot attachments
  for (const m of messages) {
    m.text = m.text.replace(/\s+$/, '');
    const first = m.text.split('\n')[0].trim();
    for (const re of ATTACH_PATTERNS) {
      const a = re.exec(first);
      if (a) {
        m.attachment = a[1].trim();
        m.text = m.text.split('\n').slice(1).join('\n');
        break;
      }
    }
    if (OMITTED.test(first)) m.text = '[' + first.replace(/[<>]/g, '') + ']';
  }
  // keep order stable (exports are already in time order)
  const senders = [...new Set(messages.map((m) => m.sender))];
  return { messages, senders, dateOrder, ambiguous, skipped };
}

/**
 * Stable ids that do not depend on contact names, so the same chat imported on both phones lines up:
 * the id comes from the time, who wrote it (by key), the text, and which repeat of that it is.
 */
export function makeIds(messages: WaMessage[], authorKey: (m: WaMessage) => string): string[] {
  const seen = new Map<string, number>();
  return messages.map((m) => {
    const base = m.ts + '|' + authorKey(m) + '|' + m.text + '|' + (m.attachment ? 'att' : '');
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

export const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
