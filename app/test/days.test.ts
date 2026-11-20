import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breakdown, daysTogether, milestones, nextAnniversary, parseDate } from '../src/core/days';

const at = (s: string) => new Date(s + 'T15:30:00').getTime();

test('day one is the day you started', () => {
  assert.equal(daysTogether('2024-01-01', at('2024-01-01')), 1);
  assert.equal(daysTogether('2024-01-01', at('2024-01-02')), 2);
  assert.equal(daysTogether('2023-02-14', at('2024-02-14')), 366);
  assert.equal(daysTogether('2025-01-01', at('2024-01-01')), 0);
  assert.equal(daysTogether('', at('2024-01-01')), 0);
});
test('bad dates are refused', () => {
  assert.equal(parseDate('2023-02-31'), null);
  assert.equal(parseDate('2023-13-01'), null);
  assert.equal(parseDate('hello'), null);
  assert.ok(parseDate('2024-02-29'));
});
test('years, months and days', () => {
  assert.deepEqual(breakdown('2023-02-14', at('2024-03-16')), { years: 1, months: 1, days: 2 });
  assert.deepEqual(breakdown('2023-12-31', at('2024-01-01')), { years: 0, months: 0, days: 1 });
  assert.deepEqual(breakdown('2024-01-15', at('2024-01-15')), { years: 0, months: 0, days: 0 });
  assert.deepEqual(breakdown('2020-05-20', at('2024-05-19')), { years: 3, months: 11, days: 29 });
});
test('milestones', () => {
  assert.deepEqual(milestones(0), { passed: [], prev: 0, next: 50 });
  assert.deepEqual(milestones(100), { passed: [50, 100], prev: 100, next: 200 });
  assert.equal(milestones(367).prev, 365);
  assert.equal(milestones(367).next, 500);
  assert.equal(milestones(6000).next, 7000);
});
test('next anniversary', () => {
  assert.deepEqual(nextAnniversary('2023-02-14', at('2024-02-10')), { inDays: 4, year: 1 });
  assert.deepEqual(nextAnniversary('2023-02-14', at('2024-02-14')), { inDays: 0, year: 1 });
  assert.deepEqual(nextAnniversary('2023-02-14', at('2024-02-15')), { inDays: 365, year: 2 });
});
