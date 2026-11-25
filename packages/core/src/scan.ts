import { rules as defaultRules } from './rules/index.ts';
import type { Finding, Group, Rule, Severity } from './types.ts';

export interface ScanOptions {
  groups?: Group[];
  rules?: Rule[];
}

const RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1, info: 0 };

export function scan(text: string, opts: ScanOptions = {}): Finding[] {
  const active = (opts.rules ?? defaultRules).filter((r) => !opts.groups || opts.groups.includes(r.group));
  const found: Finding[] = [];

  for (const rule of active) {
    // Fresh regex per scan: a shared lastIndex would break reentrant use.
    const re = new RegExp(rule.pattern.source, [...new Set(rule.pattern.flags + 'gd')].join(''));
    for (const m of text.matchAll(re)) {
      const [start, end] = m.indices?.groups?.v ?? [m.index!, m.index! + m[0].length];
      if (start === end) continue;
      const value = text.slice(start, end);
      const res = rule.validate ? rule.validate(value, { text, start, end }) : true;
      if (res === false) continue;
      const o = typeof res === 'object' ? res : {};
      found.push({
        ruleId: rule.id,
        label: o.label ?? rule.label,
        group: rule.group,
        severity: o.severity ?? rule.severity,
        confidence: o.confidence ?? rule.confidence ?? 'certain',
        start,
        end,
        value,
        maskToken: rule.maskToken,
        why: rule.why,
        action: rule.action,
        source: 'rule',
      });
    }
  }
  return resolveOverlaps(found);
}

/** Overlapping findings: keep higher severity, then longer. Exported for merging AI results later. */
export function resolveOverlaps(found: Finding[]): Finding[] {
  // ponytail: O(n²) overlap check; switch to a sweep over sorted starts if large files get slow.
  const sorted = [...found].sort(
    (a, b) => RANK[b.severity] - RANK[a.severity] || b.end - b.start - (a.end - a.start) || a.start - b.start,
  );
  const kept: Finding[] = [];
  for (const f of sorted) if (!kept.some((k) => f.start < k.end && k.start < f.end)) kept.push(f);
  return kept.sort((a, b) => a.start - b.start);
}
