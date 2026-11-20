import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, formatNumber } from '../src/disguise/calcEngine';

const f = (e: string, deg = true) => { const r = evaluate(e, { deg }); return r === null ? null : formatNumber(r); };

test('order of operations', () => {
  assert.equal(evaluate('2+3×4'), 14);
  assert.equal(evaluate('10−4÷2'), 8);
  assert.equal(evaluate('2×3+4×5'), 26);
});
test('decimals and percent', () => {
  assert.equal(f('0.1+0.2'), '0.3');
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
test('brackets, closed for you, and implicit multiplication', () => {
  assert.equal(evaluate('(2+3)×4'), 20);
  assert.equal(evaluate('(2+3'), 5);
  assert.equal(evaluate('2×(3+4'), 14);
  assert.equal(evaluate('3(4+1)'), 15);
  assert.equal(evaluate('((2))'), 2);
  assert.equal(evaluate('2)'), null);
  assert.equal(f('2π'), '6.2831853072');
});
test('powers, roots and factorial', () => {
  assert.equal(evaluate('2^10'), 1024);
  assert.equal(evaluate('2^3^2'), 512);
  assert.equal(evaluate('√16'), 4);
  assert.equal(evaluate('√(9+16)'), 5);
  assert.equal(evaluate('5!'), 120);
  assert.equal(evaluate('0!'), 1);
  assert.equal(evaluate('3.5!'), null);
  assert.equal(evaluate('−2^2'), -4);
});
test('trigonometry in degrees and radians, logs, constants', () => {
  assert.equal(f('sin(30)'), '0.5');
  assert.equal(f('cos(60)'), '0.5');
  assert.equal(f('tan(45)'), '1');
  assert.equal(f('sin(180)'), '0');
  assert.equal(f('sin(π÷2)', false), '1');
  assert.equal(f('ln(e)'), '1');
  assert.equal(f('log(1000)'), '3');
  assert.equal(evaluate('foo(3)'), null);
});
test('stray symbols do not crash', () => {
  for (const bad of ['(', ')', '+', '!', '^', '((', '2^', 'sin', '√', '..', '1..2']) assert.doesNotThrow(() => evaluate(bad));
});
