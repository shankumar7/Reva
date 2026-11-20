// A small, safe calculator engine (no eval). Supports + − × ÷ and % and decimals.
const OPS: Record<string, { p: number; f: (a: number, b: number) => number }> = {
  '+': { p: 1, f: (a, b) => a + b },
  '−': { p: 1, f: (a, b) => a - b },
  '×': { p: 2, f: (a, b) => a * b },
  '÷': { p: 2, f: (a, b) => a / b },
};

export function evaluate(expr: string): number | null {
  const tokens: (number | string)[] = [];
  let i = 0;
  let prevWasValue = false;
  while (i < expr.length) {
    const ch = expr[i];
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      const n = Number(expr.slice(i, j));
      if (Number.isNaN(n)) return null;
      tokens.push(n);
      prevWasValue = true;
      i = j;
    } else if (ch === '%') {
      if (!prevWasValue) return null;
      const last = tokens.pop() as number;
      tokens.push(last / 100);
      i++;
    } else if (ch in OPS) {
      if (!prevWasValue) {
        // a leading minus means a negative number
        if (ch === '−' && i + 1 < expr.length && /[0-9.]/.test(expr[i + 1])) {
          let j = i + 1;
          while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
          tokens.push(-Number(expr.slice(i + 1, j)));
          prevWasValue = true;
          i = j;
          continue;
        }
        return null;
      }
      tokens.push(ch);
      prevWasValue = false;
      i++;
    } else return null;
  }
  if (!prevWasValue) tokens.pop(); // drop a dangling operator
  if (!tokens.length) return null;

  const out: (number | string)[] = [];
  const stack: string[] = [];
  for (const t of tokens) {
    if (typeof t === 'number') out.push(t);
    else {
      while (stack.length && OPS[stack[stack.length - 1]].p >= OPS[t].p) out.push(stack.pop()!);
      stack.push(t);
    }
  }
  while (stack.length) out.push(stack.pop()!);
  const v: number[] = [];
  for (const t of out) {
    if (typeof t === 'number') v.push(t);
    else {
      const b = v.pop(), a = v.pop();
      if (a === undefined || b === undefined) return null;
      v.push(OPS[t].f(a, b));
    }
  }
  const r = v[0];
  return Number.isFinite(r) ? r : null;
}

export function formatNumber(n: number): string {
  if (Math.abs(n) >= 1e12 || (Math.abs(n) < 1e-7 && n !== 0)) return n.toExponential(6).replace(/\.?0+e/, 'e');
  const s = String(Math.round(n * 1e10) / 1e10);
  return s;
}
