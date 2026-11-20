import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, ACCENTS, resolveTheme } from '../src/themes';
import { contrast } from '../src/colors';

test('every theme is readable', () => {
  assert.ok(THEMES.length >= 30);
  const bad: string[] = [];
  for (const t of THEMES) {
    const checks: [string, number, number][] = [
      ['text on page', contrast(t.text, t.bg), 7],
      ['text on card', contrast(t.text, t.surface), 7],
      ['dim text on page', contrast(t.textDim, t.bg), 3.4],
      ['button text', contrast(t.onAccent, t.accent), 4.5],
      ['my bubble text', contrast(t.onMine, t.bubbleMine), 4.5],
      ['their bubble text', contrast(t.onTheirs, t.bubbleTheirs), 4.5],
      ['accent against page', contrast(t.accent, t.bg), 1.6],
    ];
    for (const [what, got, want] of checks) if (got < want) bad.push(`${t.name}: ${what} ${got.toFixed(2)} < ${want}`);
  }
  assert.deepEqual(bad, []);
});

test('theme ids are unique and accents keep text readable', () => {
  assert.equal(new Set(THEMES.map((t) => t.id)).size, THEMES.length);
  for (const t of [THEMES[0], THEMES[1], THEMES[5]]) for (const a of ACCENTS) {
    const r = resolveTheme(t.id, false, a);
    assert.ok(contrast(r.onAccent, r.accent) >= 4.5, a);
    assert.ok(contrast(r.onMine, r.bubbleMine) >= 4.5, a);
  }
});
