// A safe calculator engine (no eval): + − × ÷ ^ % ! parentheses, sin cos tan ln log √ and π e,
// degrees or radians, implicit multiplication (2π, 3(4+1)), and auto-closed brackets.

export interface CalcOptions { deg?: boolean }

const FUNCS: Record<string, (x: number, deg: boolean) => number> = {
  sin: (x, d) => Math.sin(d ? (x * Math.PI) / 180 : x),
  cos: (x, d) => Math.cos(d ? (x * Math.PI) / 180 : x),
  tan: (x, d) => Math.tan(d ? (x * Math.PI) / 180 : x),
  ln: (x) => Math.log(x),
  log: (x) => Math.log10(x),
  '√': (x) => Math.sqrt(x),
};

type Tok = { t: 'num'; v: number } | { t: 'op'; v: string } | { t: 'fn'; v: string } | { t: 'const'; v: number } | { t: 'lp' } | { t: 'rp' };

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ') { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const n = Number(src.slice(i, j));
      if (Number.isNaN(n)) return null;
      out.push({ t: 'num', v: n });
      i = j;
    } else if ('+−-×÷*/^!%'.includes(ch)) {
      out.push({ t: 'op', v: ch === '-' ? '−' : ch === '*' ? '×' : ch === '/' ? '÷' : ch });
      i++;
    } else if (ch === '(') { out.push({ t: 'lp' }); i++; }
    else if (ch === ')') { out.push({ t: 'rp' }); i++; }
    else if (ch === 'π') { out.push({ t: 'const', v: Math.PI }); i++; }
    else if (ch === '√') { out.push({ t: 'fn', v: '√' }); i++; }
    else if (/[a-z]/.test(ch)) {
      let j = i;
      while (j < src.length && /[a-z]/.test(src[j])) j++;
      const w = src.slice(i, j);
      if (w === 'e') out.push({ t: 'const', v: Math.E });
      else if (w in FUNCS) out.push({ t: 'fn', v: w });
      else return null;
      i = j;
    } else return null;
  }
  return out;
}

function factorial(n: number): number | null {
  if (!Number.isInteger(n) || n < 0 || n > 170) return null;
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
}

export function evaluate(expr: string, opts: CalcOptions = {}): number | null {
  const deg = opts.deg ?? true;
  let toks = tokenize(expr);
  if (!toks || !toks.length) return null;
  // a dangling operator at the end is ignored (5+ means 5); open brackets are closed for you
  while (toks.length && toks[toks.length - 1].t === 'op' && !'!%'.includes((toks[toks.length - 1] as { v: string }).v)) toks = toks.slice(0, -1);
  let open = 0;
  for (const t of toks) { if (t.t === 'lp') open++; else if (t.t === 'rp') open--; }
  if (open < 0) return null;
  for (let k = 0; k < open; k++) toks.push({ t: 'rp' });
  if (!toks.length) return null;

  let pos = 0;
  const peek = () => toks![pos];
  let failed = false;
  const fail = () => { failed = true; return 0; };

  function parseExpr(): number {
    let v = parseTerm();
    while (!failed) {
      const t = peek();
      if (t && t.t === 'op' && (t.v === '+' || t.v === '−')) { pos++; const r = parseTerm(); v = t.v === '+' ? v + r : v - r; } else break;
    }
    return v;
  }
  function parseTerm(): number {
    let v = parseUnary();
    while (!failed) {
      const t = peek();
      if (t && t.t === 'op' && (t.v === '×' || t.v === '÷')) { pos++; const r = parseUnary(); v = t.v === '×' ? v * r : v / r; }
      else if (t && (t.t === 'num' || t.t === 'const' || t.t === 'fn' || t.t === 'lp')) { v = v * parseUnary(); } // 2π, 3(4+1)
      else break;
    }
    return v;
  }
  function parseUnary(): number {
    const t = peek();
    if (t && t.t === 'op' && t.v === '−') { pos++; return -parseUnary(); }
    if (t && t.t === 'op' && t.v === '+') { pos++; return parseUnary(); }
    return parsePower();
  }
  function parsePower(): number {
    const base = parsePostfix();
    const t = peek();
    if (t && t.t === 'op' && t.v === '^') { pos++; return Math.pow(base, parseUnary()); } // right-leaning: 2^3^2
    return base;
  }
  function parsePostfix(): number {
    let v = parsePrimary();
    while (!failed) {
      const t = peek();
      if (t && t.t === 'op' && t.v === '!') { pos++; const f = factorial(v); if (f === null) return fail(); v = f; }
      else if (t && t.t === 'op' && t.v === '%') { pos++; v = v / 100; }
      else break;
    }
    return v;
  }
  function parsePrimary(): number {
    const t = peek();
    if (!t) return fail();
    pos++;
    if (t.t === 'num') return t.v;
    if (t.t === 'const') return t.v;
    if (t.t === 'lp') {
      const v = parseExpr();
      if (peek()?.t !== 'rp') return fail();
      pos++;
      return v;
    }
    if (t.t === 'fn') {
      // √16, sin(30), sin30
      const arg = peek()?.t === 'lp' ? parsePrimary() : parsePostfix();
      return FUNCS[t.v](arg, deg);
    }
    return fail();
  }

  const r = parseExpr();
  if (failed || pos !== toks.length) return null;
  return Number.isFinite(r) ? r : null;
}

export function formatNumber(n: number): string {
  // sin(180) and friends leave dust like 1.2e-16: show 0
  if (Math.abs(n) < 1e-12) return '0';
  if (Math.abs(n) >= 1e12 || (Math.abs(n) < 1e-7 && n !== 0)) return n.toExponential(6).replace(/\.?0+e/, 'e');
  return String(Math.round(n * 1e10) / 1e10);
}
