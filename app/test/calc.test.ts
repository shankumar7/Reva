import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, formatNumber } from '../src/disguise/calcEngine';

test('order of operations', () => {
  assert.equal(evaluate('2+3×4'), 14);
  assert.equal(evaluate('10−4÷2'), 8);
  assert.equal(evaluate('2×3+4×5'), 26);
});
test('decimals and percent', () => {
  assert.equal(formatNumber(evaluate('0.1+0.2')!), '0.3');
  assert.equal(evaluate('50%'), 0.5);
  assert.equal(evaluate('200×10%'), 20);
});
test('negatives, dangling operators, divide by zero', () => {
  assert.equal(evaluate('−5+2'), -3);
  assert.equal(evaluate('5+'), 5);
  assert.equal(evaluate('5÷0'), null);
  assert.equal(evaluate(''), null);
  assert.equal(evaluate('×5'), null);
});
test('a passcode typed alone just shows the number', () => {
  assert.equal(evaluate('482913'), 482913);
});
