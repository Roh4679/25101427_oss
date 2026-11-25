import type { Finding } from './types.ts';

export interface MaskOptions {
  /** Also mask 'estimated' findings. Default true. */
  includeEstimated?: boolean;
}

export interface MaskResult {
  text: string;
  /** token -> original value. Keep in memory only. */
  map: Map<string, string>;
}

export function mask(text: string, findings: Finding[], opts: MaskOptions = {}): MaskResult {
  const includeEstimated = opts.includeEstimated ?? true;
  const map = new Map<string, string>();
  const tokenOf = new Map<string, string>();
  const counters = new Map<string, number>();
  let out = '';
  let pos = 0;

  for (const f of [...findings].sort((a, b) => a.start - b.start)) {
    if (!f.maskToken || f.start < pos) continue;
    if (f.confidence === 'estimated' && !includeEstimated) continue;
    const key = f.maskToken + '\u0000' + f.value;
    let token = tokenOf.get(key);
    if (!token) {
      const n = (counters.get(f.maskToken) ?? 0) + 1;
      counters.set(f.maskToken, n);
      token = `[${f.maskToken}${n}]`;
      tokenOf.set(key, token);
      map.set(token, f.value);
    }
    out += text.slice(pos, f.start) + token;
    pos = f.end;
  }
  return { text: out + text.slice(pos), map };
}

/** Put original values back. Longer tokens first so [이름10] is not eaten by [이름1]. */
export function restore(text: string, map: Map<string, string>): string {
  if (!map.size) return text;
  const tokens = [...map.keys()].sort((a, b) => b.length - a.length);
  // One pass, so restored values are never re-scanned for tokens.
  const re = new RegExp(tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  return text.replace(re, (t) => map.get(t)!);
}

/** Partially hidden value for display (CLI output, lists). */
export function redact(value: string): string {
  const v = [...value];
  if (v.length < 8) return v[0] + '*'.repeat(v.length - 1);
  return v.slice(0, 2).join('') + '*'.repeat(v.length - 4) + v.slice(-2).join('');
}
