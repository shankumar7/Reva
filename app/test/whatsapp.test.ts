import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWhatsApp, waId } from '../src/core/whatsapp';

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

test('ids are stable and unique', () => {
  const r = parseWhatsApp('01/01/2024, 10:00 - A: hi\n01/01/2024, 10:00 - A: hi');
  assert.equal(waId(r.messages[0], 0), waId(r.messages[0], 0));
  assert.notEqual(waId(r.messages[0], 0), waId(r.messages[1], 1));
});
