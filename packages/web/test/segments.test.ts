import { scan } from '@pii-guard/core';
import { describe, expect, it } from 'vitest';
import { segments } from '../src/segments.ts';

describe('segments', () => {
  it('splits text around findings and keeps every character', () => {
    const text = '연락처 010-1234-5678 입니다';
    const s = segments(text, scan(text));
    expect(s.map((x) => x.text).join('')).toBe(text);
    expect(s.map((x) => x.finding?.ruleId)).toEqual([undefined, 'mobile', undefined]);
  });

  it('handles findings at both edges and empty text', () => {
    expect(segments('010-1234-5678', scan('010-1234-5678'))).toHaveLength(1);
    expect(segments('', [])).toEqual([]);
  });
});
