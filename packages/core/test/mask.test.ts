import { describe, expect, it } from 'vitest';
import { mask, redact, restore, scan } from '../src/index.ts';

describe('mask / restore', () => {
  const text = '홍길동님 연락처 010-1234-5678, 다시 010-1234-5678. 메일 a.b@example.com';

  it('same value gets the same token', () => {
    const { text: out } = mask(text, scan(text));
    expect(out).toBe('[이름1]님 연락처 [전화1], 다시 [전화1]. 메일 [이메일1]');
  });

  it('round-trips through restore', () => {
    const { text: out, map } = mask(text, scan(text));
    expect(restore(out, map)).toBe(text);
  });

  it('can skip estimated findings', () => {
    const { text: out } = mask(text, scan(text), { includeEstimated: false });
    expect(out.startsWith('홍길동님')).toBe(true);
  });

  it('restores [x10] before [x1]', () => {
    const map = new Map([
      ['[이름1]', 'A'],
      ['[이름10]', 'B'],
    ]);
    expect(restore('[이름10] [이름1]', map)).toBe('B A');
  });

  it('does not re-expand a restored value that looks like a token', () => {
    const map = new Map([
      ['[이름1]', '[이름2]'],
      ['[이름2]', 'X'],
    ]);
    expect(restore('[이름1]', map)).toBe('[이름2]');
  });

  it('warn-only findings are left as is', () => {
    expect(mask('우울증', scan('우울증')).text).toBe('우울증');
  });
});

describe('redact', () => {
  it('hides most of the value', () => {
    expect(redact('hong@example.com')).toBe('ho************om');
    expect(redact('홍길동')).toBe('홍**');
  });
});
