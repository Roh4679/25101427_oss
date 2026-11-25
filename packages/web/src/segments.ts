import type { Finding } from '@pii-guard/core';

export interface Segment {
  text: string;
  finding?: Finding;
}

/** Split text into plain and highlighted pieces. Findings must not overlap (scan() guarantees it). */
export function segments(text: string, findings: Finding[]): Segment[] {
  const out: Segment[] = [];
  let pos = 0;
  for (const f of findings) {
    if (f.start > pos) out.push({ text: text.slice(pos, f.start) });
    out.push({ text: text.slice(f.start, f.end), finding: f });
    pos = f.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}
