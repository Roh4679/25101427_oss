import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run } from '../src/cli.ts';

// Fake values only.
const SAMPLE = '담당: 홍길동님\n연락처 010-1234-5678\n';

async function cli(args: string[], stdin: string | null = null) {
  let out = '';
  let err = '';
  const code = await run(args, { readStdin: async () => stdin, out: (s) => (out += s), err: (s) => (err += s) });
  return { code, out, err };
}

let dir: string;
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'pii-guard-test-'))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('scan', () => {
  it('hides values by default and shows position', async () => {
    const r = await cli(['scan'], SAMPLE);
    expect(r.code).toBe(0);
    expect(r.out).toContain('<stdin>:2:5');
    expect(r.out).toContain('01*********78');
    expect(r.out).not.toContain('010-1234-5678');
  });

  it('--show-values prints raw values', async () => {
    expect((await cli(['scan', '--show-values'], SAMPLE)).out).toContain('010-1234-5678');
  });

  it('--json', async () => {
    const rows = JSON.parse((await cli(['scan', '--json'], SAMPLE)).out);
    expect(rows.map((r: { ruleId: string }) => r.ruleId)).toEqual(['name-honorific', 'mobile']);
  });

  it('--fail-on', async () => {
    expect((await cli(['scan', '--fail-on', 'high'], SAMPLE)).code).toBe(1);
    expect((await cli(['scan', '--fail-on', 'high'], '홍길동님')).code).toBe(0);
  });

  it('says nothing found is not the same as safe', async () => {
    expect((await cli(['scan'], '안녕하세요')).out).toMatch(/안전하다는 뜻은 아닙니다/);
  });

  it('reads files', async () => {
    const f = join(dir, 'a.txt');
    writeFileSync(f, SAMPLE);
    expect((await cli(['scan', f])).out).toContain(`${f}:2:5`);
  });

  it('ignores a UTF-8 BOM in files', async () => {
    const f = join(dir, 'bom.txt');
    writeFileSync(f, '﻿' + SAMPLE);
    expect((await cli(['scan', f])).out).toContain(`${f}:1:5`);
  });

  it('ignores a BOM on stdin', async () => {
    expect((await cli(['mask'], '﻿홍길동님')).out).toBe('[이름1]님');
  });

  it('asks for input when nothing is piped', async () => {
    expect((await cli(['scan'], null)).code).toBe(2);
  });
});

describe('mask / restore with --map', () => {
  it('without --map: masks, hints, writes nothing', async () => {
    const r = await cli(['mask'], SAMPLE);
    expect(r.out).toBe('담당: [이름1]님\n연락처 [전화1]\n');
    expect(r.err).toMatch(/--map/);
  });

  it('with --map: writes the map and warns that it holds original values', async () => {
    const map = join(dir, 'map.json');
    const r = await cli(['mask', '--map', map], SAMPLE);
    expect(r.code).toBe(0);
    expect(r.err).toMatch(/원본 값이 그대로/);
    const data = JSON.parse(readFileSync(map, 'utf8'));
    expect(data).toEqual({ 'pii-guard-map': 1, encryption: 'none', entries: { '[이름1]': '홍길동', '[전화1]': '010-1234-5678' } });
    if (process.platform !== 'win32') expect(statSync(map).mode & 0o777).toBe(0o600);
  });

  it('refuses to overwrite an existing map', async () => {
    const map = join(dir, 'map.json');
    writeFileSync(map, 'old');
    const r = await cli(['mask', '--map', map], SAMPLE);
    expect(r.code).toBe(2);
    expect(r.out).toBe('');
    expect(readFileSync(map, 'utf8')).toBe('old');
  });

  it('restore requires --map', async () => {
    const r = await cli(['restore'], '[이름1]');
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/restore에는 --map이 필요합니다/);
  });

  it('round-trips an AI answer', async () => {
    const map = join(dir, 'map.json');
    await cli(['mask', '--map', map], SAMPLE);
    const r = await cli(['restore', '--map', map], '[이름1]님께 [전화1]로 연락하세요.');
    expect(r.out).toBe('홍길동님께 010-1234-5678로 연락하세요.');
  });

  it('rejects map formats it does not know (e.g. encrypted)', async () => {
    const map = join(dir, 'map.json');
    writeFileSync(map, JSON.stringify({ 'pii-guard-map': 1, encryption: 'aes-256-gcm', entries: {} }));
    const r = await cli(['restore', '--map', map], 'x');
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/지원하지 않는 대응표 형식/);
  });
});
