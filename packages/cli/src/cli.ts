import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { mask, redact, restore, scan, type Finding, type Group, type Severity } from '@pii-guard/core';

export interface IO {
  /** Whole stdin, or null when stdin is a terminal (nothing piped). */
  readStdin(): Promise<string | null>;
  out(s: string): void;
  err(s: string): void;
}

export const MAX_BYTES = 5 * 1024 * 1024;
const RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1, info: 0 };
const SEVERITY_KO: Record<Severity, string> = { high: '높음', medium: '중간', low: '낮음', info: '참고' };
const CONFIDENCE_KO = { certain: '확실', estimated: '추정' } as const;
const GROUPS: Group[] = ['personal', 'dev', 'sensitive'];

// Map file format. `encryption` is reserved for an encrypted variant (PLAN.md 11, option B).
const MAP_FORMAT = 1;
interface MapFile {
  'pii-guard-map': number;
  encryption: 'none';
  entries: Record<string, string>;
}

const USAGE = `사용법: pii-guard <명령> [파일...] [옵션]

명령
  scan [파일...]      개인정보·시크릿을 찾아 보여 줍니다 (파일이 없으면 표준 입력)
  mask [파일]         찾은 값을 가명으로 바꾼 텍스트를 출력합니다
  restore [파일]      AI 답변 속 가명을 원래 값으로 되돌립니다 (--map 필요)

옵션
  --groups <목록>     검사 범위: personal,dev,sensitive (기본: 전부)
  --json              scan 결과를 JSON으로 출력
  --show-values       scan에서 찾은 값을 가리지 않고 출력 (주의)
  --fail-on <등급>    high|medium|low 이상이 있으면 종료 코드 1
  --skip-estimated    mask에서 '추정' 항목은 가리지 않음
  --map <경로>        mask: 대응표를 이 경로에 저장 / restore: 이 대응표로 복원
  -h, --help          도움말

예: cat error.log | pii-guard mask --map map.json`;

class CliError extends Error {}

export async function run(argv: string[], io: IO): Promise<number> {
  try {
    return await main(argv, io);
  } catch (e) {
    if (!(e instanceof CliError)) throw e;
    io.err(`오류: ${e.message}\n`);
    return 2;
  }
}

async function main(argv: string[], io: IO): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        groups: { type: 'string' },
        json: { type: 'boolean' },
        'show-values': { type: 'boolean' },
        'fail-on': { type: 'string' },
        'skip-estimated': { type: 'boolean' },
        map: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (e) {
    throw new CliError(`${(e as Error).message}\n\n${USAGE}`);
  }
  const { values: opt, positionals } = parsed;
  const [cmd, ...files] = positionals;
  if (opt.help || !cmd) {
    io.out(USAGE + '\n');
    return opt.help ? 0 : 2;
  }

  const groups = opt.groups?.split(',').map((g) => g.trim()) as Group[] | undefined;
  if (groups?.some((g) => !GROUPS.includes(g))) throw new CliError(`--groups는 ${GROUPS.join(', ')} 중에서 고르세요.`);

  switch (cmd) {
    case 'scan': {
      const failOn = opt['fail-on'];
      if (failOn && !['high', 'medium', 'low'].includes(failOn)) throw new CliError('--fail-on은 high, medium, low 중 하나입니다.');
      const report = [];
      for (const input of await readInputs(files, io)) {
        const findings = scan(input.text, { groups });
        report.push(...withPosition(input.text, findings).map(({ f, line, column }) => ({ file: input.name, line, column, f })));
      }
      const show = (v: string) => (opt['show-values'] ? v : redact(v));
      if (opt.json) {
        const rows = report.map(({ file, line, column, f }) => ({
          file, line, column,
          ruleId: f.ruleId, label: f.label, group: f.group, severity: f.severity, confidence: f.confidence,
          value: show(f.value), why: f.why, action: f.action,
        }));
        io.out(JSON.stringify(rows, null, 2) + '\n');
      } else {
        io.out(formatHuman(report, show));
      }
      const threshold = failOn ? RANK[failOn as Severity] : Infinity;
      return report.some(({ f }) => RANK[f.severity] >= threshold) ? 1 : 0;
    }

    case 'mask': {
      const input = await readSingleInput(files, io, 'mask');
      const result = mask(input.text, scan(input.text, { groups }), { includeEstimated: !opt['skip-estimated'] });
      if (opt.map) {
        writeMap(opt.map, result.map);
        io.err(
          `경고: 대응표 파일 ${opt.map}에는 가리기 전 원본 값이 그대로 들어 있습니다.\n` +
            `  AI나 다른 사람에게 보내지 말고, git에 올리지 말고, 복원이 끝나면 지우세요.\n`,
        );
      } else {
        io.err('안내: 대응표를 저장하지 않았습니다. 나중에 복원하려면 --map <경로>를 지정하세요.\n');
      }
      io.out(result.text);
      return 0;
    }

    case 'restore': {
      if (!opt.map) {
        throw new CliError(
          'restore에는 --map이 필요합니다.\n' +
            '  가릴 때 대응표를 저장해 두고: pii-guard mask input.txt --map map.json\n' +
            '  그 대응표로 복원하세요:       pii-guard restore answer.txt --map map.json',
        );
      }
      const map = readMap(opt.map);
      const input = await readSingleInput(files, io, 'restore');
      io.out(restore(input.text, map));
      return 0;
    }

    default:
      throw new CliError(`알 수 없는 명령: ${cmd}\n\n${USAGE}`);
  }
}

interface Input {
  name: string;
  text: string;
}

async function readInputs(files: string[], io: IO): Promise<Input[]> {
  if (!files.length) {
    // PowerShell pipes add a BOM too.
    const text = (await io.readStdin())?.replace(/^﻿/, '') ?? null;
    if (text === null) throw new CliError(`검사할 파일을 지정하거나 표준 입력으로 넘겨 주세요.\n\n${USAGE}`);
    if (Buffer.byteLength(text) > MAX_BYTES) throw new CliError('입력이 너무 큽니다 (5MB 초과).');
    return [{ name: '<stdin>', text }];
  }
  return files.map((name) => {
    let size;
    try {
      size = statSync(name).size;
    } catch {
      throw new CliError(`파일을 열 수 없습니다: ${name}`);
    }
    if (size > MAX_BYTES) throw new CliError(`파일이 너무 큽니다 (5MB 초과): ${name}`);
    // Strip the UTF-8 BOM that Windows tools (Notepad, PowerShell 5.1) add, or positions shift by one.
    return { name, text: readFileSync(name, 'utf8').replace(/^﻿/, '') };
  });
}

async function readSingleInput(files: string[], io: IO, cmd: string): Promise<Input> {
  if (files.length > 1) throw new CliError(`${cmd}는 파일을 하나만 받습니다.`);
  return (await readInputs(files, io))[0];
}

function writeMap(path: string, map: Map<string, string>) {
  const data: MapFile = { 'pii-guard-map': MAP_FORMAT, encryption: 'none', entries: Object.fromEntries(map) };
  try {
    // 'wx': never overwrite — an older map may be the only way to restore earlier output.
    writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new CliError(`${path} 파일이 이미 있습니다. 이전 대응표를 덮어쓰지 않도록 다른 경로를 지정하세요.`);
    }
    throw new CliError(`대응표를 저장할 수 없습니다: ${path}`);
  }
}

function readMap(path: string): Map<string, string> {
  let data: Partial<MapFile>;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new CliError(`대응표를 읽을 수 없습니다: ${path}`);
  }
  if (data['pii-guard-map'] !== MAP_FORMAT || typeof data.entries !== 'object' || !data.entries) {
    throw new CliError(`pii-guard 대응표 파일이 아닙니다: ${path}`);
  }
  if (data.encryption !== 'none') throw new CliError(`지원하지 않는 대응표 형식입니다 (encryption: ${data.encryption}).`);
  return new Map(Object.entries(data.entries));
}

/** 1-based line/column for findings sorted by start. */
function withPosition(text: string, findings: Finding[]) {
  let line = 1;
  let lastNewline = -1;
  let i = 0;
  return findings.map((f) => {
    for (; i < f.start; i++) if (text.charCodeAt(i) === 10) { line++; lastNewline = i; }
    return { f, line, column: f.start - lastNewline };
  });
}

function formatHuman(report: { file: string; line: number; column: number; f: Finding }[], show: (v: string) => string): string {
  if (!report.length) return '규칙에 걸린 항목이 없습니다. 다만 발견 없음이 안전하다는 뜻은 아닙니다.\n';
  let s = '';
  for (const { file, line, column, f } of report) {
    s += `${file}:${line}:${column}  [${SEVERITY_KO[f.severity]}·${CONFIDENCE_KO[f.confidence]}] ${f.label}  ${show(f.value)}\n`;
    s += `    이유: ${f.why}\n`;
    if (f.action) s += `    조치: ${f.action}\n`;
  }
  const counts = (Object.keys(SEVERITY_KO) as Severity[])
    .map((sev) => [sev, report.filter(({ f }) => f.severity === sev).length] as const)
    .filter(([, n]) => n)
    .map(([sev, n]) => `${SEVERITY_KO[sev]} ${n}`);
  return s + `\n${report.length}건 발견 (${counts.join(', ')})\n`;
}
