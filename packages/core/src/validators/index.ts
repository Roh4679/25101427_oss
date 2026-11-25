export const digits = (s: string) => s.replace(/\D/g, '');

export function luhn(num: string): boolean {
  const d = digits(num);
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = +d[d.length - 1 - i];
    if (i % 2) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}

export function isValidDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Korean resident / foreigner registration number: date part. */
export function rrnDateValid(num: string): boolean {
  const d = digits(num);
  const g = +d[6];
  const century = [1, 2, 5, 6].includes(g) ? 1900 : [3, 4, 7, 8].includes(g) ? 2000 : 0;
  if (!century) return false;
  return isValidDate(century + +d.slice(0, 2), +d.slice(2, 4), +d.slice(4, 6));
}

/** Check digit (only numbers issued before 2020-10 have one). */
export function rrnChecksum(num: string): boolean {
  const d = digits(num);
  const w = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
  const sum = w.reduce((s, x, i) => s + x * +d[i], 0);
  const foreign = +d[6] >= 5;
  const check = ((foreign ? 13 : 11) - (sum % 11)) % 10;
  return check === +d[12];
}

/** Korean business registration number check digit. */
export function brnChecksum(num: string): boolean {
  const d = digits(num);
  if (d.length !== 10) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = w.reduce((s, x, i) => s + x * +d[i], 0);
  sum += Math.floor((+d[8] * 5) / 10);
  return (10 - (sum % 10)) % 10 === +d[9];
}

/** Shannon entropy in bits per character. */
export function entropy(s: string): number {
  const freq = new Map<string, number>();
  for (const c of s) freq.set(c, (freq.get(c) ?? 0) + 1);
  let e = 0;
  for (const n of freq.values()) { const p = n / s.length; e -= p * Math.log2(p); }
  return e;
}

/** True if `re` matches within `window` chars around [start, end). */
export function near(text: string, start: number, end: number, re: RegExp, window = 25): boolean {
  return re.test(text.slice(Math.max(0, start - window), end + window));
}

const PLACEHOLDER = /^(?:changeme|change_me|password|passwd|secret|example|sample|dummy|test|null|none|undefined|true|false|your[_-]?\w*|x{3,}|\*{3,}|\.{3,}|<[^>]*>|\$\{[^}]*\}|\{\{[^}]*\}\}|%[^%]*%|\$\w+)$/i;
/** Obvious example or variable reference, not a real secret. */
export const isPlaceholder = (v: string) =>
  PLACEHOLDER.test(v) || /^(?:process\.env|os\.environ|import\.meta\.env)/.test(v) || /^(.)\1+$/.test(v);
