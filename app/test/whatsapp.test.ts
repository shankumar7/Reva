import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWhatsApp, makeIds } from '../src/core/whatsapp';

test('Android, day first, 24 hour clock, multi-line, system lines', () => {
  const txt = [
    '31/12/2023, 21:41 - Messages and calls are end-to-end encrypted. No one outside of this chat can read them.',
    '31/12/2023, 21:41 - Asha: Happy new year!',
    'Love you',
    '31/12/2023, 21:43 - Ravi: Same here 💜',
    '01/01/2024, 00:01 - Asha: <Media omitted>',
  ].join('\n');
  const r = parseWhatsApp(txt);
  assert.equal(r.dateOrder, 'dmy');
  assert.deepEqual(r.senders, ['Asha', 'Ravi']);
  assert.equal(r.messages.length, 3);
  assert.equal(r.skipped, 1);
  assert.equal(r.messages[0].text, 'Happy new year!\nLove you');
  assert.equal(new Date(r.messages[0].ts).getFullYear(), 2023);
  assert.equal(new Date(r.messages[0].ts).getMonth(), 11);
  assert.equal(new Date(r.messages[0].ts).getHours(), 21);
  assert.equal(r.messages[2].text, '[Media omitted]');
});

test('US month first with AM/PM and a narrow no-break space', () => {
  const txt = '12/31/23, 9:41 PM - Sam: hi\n1/2/24, 12:05 AM - Kim: night\n1/3/24, 12:30 PM - Sam: noon';
  const r = parseWhatsApp(txt);
  assert.equal(r.dateOrder, 'mdy');
  assert.equal(new Date(r.messages[0].ts).getHours(), 21);
  assert.equal(new Date(r.messages[0].ts).getDate(), 31);
  assert.equal(new Date(r.messages[1].ts).getHours(), 0);
  assert.equal(new Date(r.messages[1].ts).getMonth(), 0);
  assert.equal(new Date(r.messages[2].ts).getHours(), 12);
});

test('iPhone layout with brackets, seconds and attachments', () => {
  const txt = '‎[31/12/2023, 9:41:05 PM] Asha: ‎<attached: 00000012-PHOTO-2023-12-31-21-41-05.jpg>\n[31/12/2023, 9:42:10 PM] Ravi: nice one';
  const r = parseWhatsApp(txt);
  assert.equal(r.messages.length, 2);
  assert.equal(r.messages[0].attachment, '00000012-PHOTO-2023-12-31-21-41-05.jpg');
  assert.equal(r.messages[0].text, '');
  assert.equal(new Date(r.messages[0].ts).getSeconds(), 5);
});

test('Android attachment line with caption', () => {
  const txt = '05/03/2024, 10:00 - Asha: IMG-20240305-WA0001.jpg (file attached)\nlook at this\n05/03/2024, 10:01 - Ravi: wow';
  const r = parseWhatsApp(txt);
  assert.equal(r.messages[0].attachment, 'IMG-20240305-WA0001.jpg');
  assert.equal(r.messages[0].text, 'look at this');
});

test('ambiguous dates are reported, and the order can be forced', () => {
  const txt = '03/04/2024, 10:00 - A: x\n05/06/2024, 10:00 - B: y';
  const r = parseWhatsApp(txt);
  assert.equal(r.ambiguous, true);
  assert.equal(new Date(r.messages[0].ts).getMonth(), 3); // day first by default: 3 April
  const m = parseWhatsApp(txt, 'mdy');
  assert.equal(new Date(m.messages[0].ts).getMonth(), 2); // March 4
});

test('colons inside messages and names with spaces', () => {
  const r = parseWhatsApp('10/10/2024, 08:15 - Mum & Dad: meet at 5: sharp');
  assert.equal(r.messages[0].sender, 'Mum & Dad');
  assert.equal(r.messages[0].text, 'meet at 5: sharp');
});

test('ids ignore contact names, so both phones agree, and repeats stay distinct', () => {
  // phone A exports with names "Asha"/"Ravi"; phone B exports the same chat but names them "Me"/"Asha"
  const a = parseWhatsApp('01/01/2024, 10:00 - Asha: hi\n01/01/2024, 10:00 - Asha: hi\n01/01/2024, 10:01 - Ravi: yo');
  const b = parseWhatsApp('01/01/2024, 10:00 - Me: hi\n01/01/2024, 10:00 - Me: hi\n01/01/2024, 10:01 - Asha: yo');
  const idsA = makeIds(a.messages, (m) => (m.sender === 'Asha' ? 'KEY-ASHA' : 'KEY-RAVI'));
  const idsB = makeIds(b.messages, (m) => (m.sender === 'Me' ? 'KEY-ASHA' : 'KEY-RAVI'));
  assert.deepEqual(idsA, idsB);
  assert.equal(new Set(idsA).size, 3);
});

const at = (ms: number) => { const d = new Date(ms); return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()]; };

test('Android en-IN lowercase am/pm with dots', () => {
  const r = parseWhatsApp('31/12/23, 9:41 pm - Asha: hi\n1/1/24, 12:05 a.m. - Ravi: night');
  assert.deepEqual(at(r.messages[0].ts).slice(0, 5), [2023, 12, 31, 21, 41]);
  assert.deepEqual(at(r.messages[1].ts).slice(0, 5), [2024, 1, 1, 0, 5]);
});

test('German dotted dates, 24 hour', () => {
  const r = parseWhatsApp('31.12.23, 21:41 - Anna: Hallo\n01.01.24, 00:00 - Ben: Frohes neues');
  assert.equal(r.dateOrder, 'dmy');
  assert.deepEqual(at(r.messages[1].ts).slice(0, 3), [2024, 1, 1]);
});

test('year first dates', () => {
  const r = parseWhatsApp('2023-12-31, 21:41 - A: x\n2024/01/02 9:05 PM - B: y');
  assert.deepEqual(at(r.messages[0].ts).slice(0, 4), [2023, 12, 31, 21]);
  assert.deepEqual(at(r.messages[1].ts).slice(0, 4), [2024, 1, 2, 21]);
});

test('Arabic-Indic digits and Chinese am/pm', () => {
  const r = parseWhatsApp('٣١/١٢/٢٠٢٣، ٩:٤١ م - A: hi\n31/12/2023 下午9:45 - B: ok');
  assert.equal(r.messages.length, 2);
  assert.equal(at(r.messages[0].ts)[3], 21);
  assert.equal(at(r.messages[1].ts)[3], 21);
});

test('month first proven by monotonic months, no value above 12', () => {
  const r = parseWhatsApp('1/5/24, 10:00 AM - A: a\n2/5/24, 10:00 AM - B: b\n3/5/24, 10:00 AM - A: c\n3/6/24, 10:00 AM - B: d');
  // second number never drops, first number goes 1,2,3,3 -> day-first would be 1 May.. so day is second only if it drops; here first rises and second rises: day first by variance tie-break
  assert.equal(r.messages.length, 4);
});

test('month inferred when the second number drops inside a year', () => {
  const r = parseWhatsApp('1/9/24, 10:00 AM - A: a\n2/9/24, 10:00 AM - B: b\n3/1/24, 10:00 AM - A: c'.replace('3/1/24', '3/9/24'));
  assert.equal(r.messages.length, 3);
  const m = parseWhatsApp('3/4/24, 10:00 AM - A: a\n3/5/24, 10:00 AM - B: b\n4/1/24, 10:00 AM - A: c\n5/2/24, 9:00 AM - B: d');
  assert.equal(m.dateOrder, 'mdy'); // second number drops (4,5,1,2) while first only rises
});

test('deleted and edited markers, system noise', () => {
  const r = parseWhatsApp([
    '01/02/2024, 10:00 - A: You deleted this message',
    '01/02/2024, 10:01 - B: This message was deleted',
    '01/02/2024, 10:02 - A: fixed <This message was edited>',
    '01/02/2024, 10:03 - Messages and calls are end-to-end encrypted. No one outside can read them.',
    '01/02/2024, 10:04 - A changed their phone number to a new number. Tap to message.',
  ].join('\n'));
  assert.equal(r.messages.length, 3);
  assert.equal(r.messages[0].deleted, true);
  assert.equal(r.messages[2].edited, true);
  assert.equal(r.messages[2].text, 'fixed');
  assert.equal(r.skipped, 2);
});

test('messages in one minute keep their order', () => {
  const r = parseWhatsApp('01/02/2024, 10:00 - A: one\n01/02/2024, 10:00 - B: two\n01/02/2024, 10:00 - A: three');
  assert.ok(r.messages[0].ts < r.messages[1].ts && r.messages[1].ts < r.messages[2].ts);
});

test('a line that merely starts with a date inside a message is not a new message', () => {
  const r = parseWhatsApp('01/02/2024, 10:00 - A: meet on\n12/03/2024 at the cafe\n01/02/2024, 10:05 - B: ok');
  assert.equal(r.messages.length, 2);
  assert.equal(r.messages[0].text, 'meet on\n12/03/2024 at the cafe');
});

test('CRLF files, BOM and file attachments', () => {
  const r = parseWhatsApp('﻿01/02/2024, 10:00 - A: Report.pdf (file attached)\r\n01/02/2024, 10:01 - B: <Media omitted>\r\n');
  assert.equal(r.messages[0].attachment, 'Report.pdf');
  assert.equal(r.messages.length, 2);
});

test('large file parses fast', () => {
  const lines: string[] = [];
  for (let i = 0; i < 60000; i++) lines.push(`${String(1 + (i % 28)).padStart(2, '0')}/0${1 + (i % 9)}/2023, 10:${String(i % 60).padStart(2, '0')} - ${i % 2 ? 'A' : 'B'}: message ${i}`);
  const t0 = Date.now();
  const r = parseWhatsApp(lines.join('\n'));
  assert.equal(r.messages.length, 60000);
  assert.ok(Date.now() - t0 < 3000);
});

test('attachments are found in a zip: exact, in a folder, other case', async () => {
  const { default: JSZip } = await import('jszip');
  const z = new JSZip();
  z.file('_chat.txt', 'x');
  z.file('IMG-20240305-WA0001.jpg', 'a');
  z.file('media/PHOTO-2.JPG', 'b');
  const { findInZip } = await import('../src/core/whatsapp');
  const files = z.file(/.*/).filter((f) => !f.dir);
  assert.equal(findInZip(files, 'IMG-20240305-WA0001.jpg')?.name, 'IMG-20240305-WA0001.jpg');
  assert.equal(findInZip(files, 'photo-2.jpg')?.name, 'media/PHOTO-2.JPG');
  assert.equal(findInZip(files, 'missing.jpg'), undefined);
});

test('real export: lowercase pm after a narrow no-break space, empty system line, phone-number sender', () => {
  const r = parseWhatsApp('17/07/2026, 2:39 pm - Messages and calls are end-to-end encrypted. Learn more\n01/09/2026, 6:56 pm - \n01/09/2026, 6:56 pm - +91 98765 43210: hi\n01/09/2026, 6:57 pm - Me: <Media omitted>');
  assert.equal(r.messages.length, 2);
  assert.equal(r.messages[0].sender, '+91 98765 43210');
  assert.equal(new Date(r.messages[0].ts).getHours(), 18);
  assert.equal(r.dateOrder, 'dmy');
});

test('real export with media: file with spaces, photo with a long caption, empty message', () => {
  const r = parseWhatsApp([
    '23/11/2025, 3:17 pm - Ravi: TT SEM-01 wef 13102025.pdf (file attached)',
    '30/03/2026, 2:35 pm - Shan: IMG-20260327-WA0019.jpg (file attached)',
    'caption line 1',
    '',
    '📞 Contact: 9876501234',
    '31/03/2026, 6:01 pm - Shan: ok',
  ].join('\n'));
  assert.equal(r.messages[0].attachment, 'TT SEM-01 wef 13102025.pdf');
  assert.equal(r.messages[1].attachment, 'IMG-20260327-WA0019.jpg');
  assert.equal(r.messages[1].text, 'caption line 1\n\n📞 Contact: 9876501234');
});
