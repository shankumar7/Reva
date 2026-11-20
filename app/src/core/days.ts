// "Days together": counting, milestones and the next anniversary. Pure maths, easy to test.

const DAY = 86_400_000;
export const MILESTONES = [50, 100, 200, 300, 365, 500, 730, 1000, 1095, 1461, 1825, 2000, 2555, 3000, 3650, 5000];

export function parseDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  // reject 2023-02-31 style dates that roll over
  if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return null;
  return d;
}

const startOfDay = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

/** Day 1 is the day you started. 0 if the date is missing or in the future. */
export function daysTogether(since: string, now = Date.now()): number {
  const d = parseDate(since);
  if (!d || d.getTime() > startOfDay(now)) return 0;
  return Math.round((startOfDay(now) - d.getTime()) / DAY) + 1;
}

/** Years, months and days between the start date and today. */
export function breakdown(since: string, now = Date.now()): { years: number; months: number; days: number } | null {
  const d = parseDate(since);
  if (!d || d.getTime() > startOfDay(now)) return null;
  const n = new Date(now);
  let years = n.getFullYear() - d.getFullYear();
  let months = n.getMonth() - d.getMonth();
  let days = n.getDate() - d.getDate();
  if (days < 0) { months -= 1; days += new Date(n.getFullYear(), n.getMonth(), 0).getDate(); }
  if (months < 0) { years -= 1; months += 12; }
  return { years, months, days };
}

/** The last milestone reached, the next one, and all the ones already passed. */
export function milestones(n: number): { passed: number[]; prev: number; next: number } {
  const passed = MILESTONES.filter((m) => m <= n);
  const next = MILESTONES.find((m) => m > n) ?? (Math.floor(n / 1000) + 1) * 1000;
  return { passed, prev: passed.length ? passed[passed.length - 1] : 0, next };
}

/** Days until the next anniversary of the start date, and which anniversary it is. */
export function nextAnniversary(since: string, now = Date.now()): { inDays: number; year: number } | null {
  const d = parseDate(since);
  if (!d || d.getTime() > startOfDay(now)) return null;
  const today = startOfDay(now);
  let year = new Date(now).getFullYear();
  let when = new Date(year, d.getMonth(), d.getDate()).getTime();
  if (when < today) { year += 1; when = new Date(year, d.getMonth(), d.getDate()).getTime(); }
  return { inDays: Math.round((when - today) / DAY), year: year - d.getFullYear() };
}
