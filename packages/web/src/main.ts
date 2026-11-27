import { mask, redact, restore, scan, type Finding, type Group } from '@pii-guard/core';
import { segments } from './segments.ts';

const MAX_BYTES = 5 * 1024 * 1024;
const AUTO_CLEAR_MS = 10 * 60 * 1000;
const SEVERITY_KO = { high: '높음', medium: '중간', low: '낮음', info: '참고' } as const;
const CONFIDENCE_KO = { certain: '확실', estimated: '추정' } as const;
const UNSUPPORTED = /\.(pdf|docx?|hwp|xlsx?|pptx?|jpe?g|png|gif|heic|webp|zip)$/i;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = $<HTMLTextAreaElement>('input');
const view = $('view');
const list = $('list');
const summary = $('summary');
const masked = $<HTMLTextAreaElement>('masked');
const answer = $<HTMLTextAreaElement>('answer');
const restored = $<HTMLTextAreaElement>('restored');
const estimated = $<HTMLInputElement>('estimated');
const fileMsg = $('file-msg');

// Only in memory. Never written to storage.
let findings: Finding[] = [];
let map = new Map<string, string>();

function groups(): Group[] {
  return [...document.querySelectorAll<HTMLInputElement>('input[name=group]:checked')].map((c) => c.value as Group);
}

function update() {
  const text = input.value;
  findings = text ? scan(text, { groups: groups() }) : [];
  renderView(text);
  renderList();
  const m = mask(text, findings, { includeEstimated: estimated.checked });
  masked.value = m.text;
  map = m.map;
  updateRestore();
}

function renderView(text: string) {
  // DOM nodes, never innerHTML: the input is untrusted.
  view.replaceChildren(
    ...segments(text, findings).map((s) => {
      if (!s.finding) return document.createTextNode(s.text);
      const mark = document.createElement('mark');
      mark.className = `sev-${s.finding.severity}`;
      mark.title = `${s.finding.label} (${SEVERITY_KO[s.finding.severity]})`;
      mark.textContent = s.text;
      return mark;
    }),
  );
}

function renderList() {
  if (!input.value) {
    summary.textContent = '';
  } else if (!findings.length) {
    summary.textContent = '규칙에 걸린 항목이 없습니다. 다만 발견 없음이 안전하다는 뜻은 아닙니다.';
  } else {
    const counts = (['high', 'medium', 'low', 'info'] as const)
      .map((s) => [s, findings.filter((f) => f.severity === s).length] as const)
      .filter(([, n]) => n)
      .map(([s, n]) => `${SEVERITY_KO[s]} ${n}`);
    summary.textContent = `${findings.length}건 발견 (${counts.join(', ')})`;
  }
  list.replaceChildren(
    ...findings.map((f) => {
      const li = document.createElement('li');
      li.className = `sev-${f.severity}`;
      const head = document.createElement('div');
      head.className = 'head';
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = `${SEVERITY_KO[f.severity]} · ${CONFIDENCE_KO[f.confidence]}`;
      const label = document.createElement('strong');
      label.textContent = f.label;
      const value = document.createElement('code');
      value.textContent = redact(f.value);
      head.append(tag, label, value);
      if (!f.maskToken) head.append(Object.assign(document.createElement('span'), { className: 'muted', textContent: '경고만 (가리지 않음)' }));
      const why = document.createElement('p');
      why.textContent = f.why;
      li.append(head, why);
      if (f.action) {
        const action = document.createElement('p');
        action.className = 'action';
        action.textContent = `조치: ${f.action}`;
        li.append(action);
      }
      return li;
    }),
  );
}

function updateRestore() {
  const msg = $('restore-msg');
  restored.value = answer.value ? restore(answer.value, map) : '';
  msg.textContent = answer.value && !map.size ? '먼저 1번에서 가명 처리할 내용을 넣으세요.' : '';
}

async function loadFile(file: File) {
  fileMsg.textContent = '';
  if (UNSUPPORTED.test(file.name) || file.type.startsWith('image/')) {
    fileMsg.textContent = `${file.name}: 이 형식은 아직 지원하지 않습니다. 텍스트 파일만 열 수 있습니다.`;
    return;
  }
  if (file.size > MAX_BYTES) {
    fileMsg.textContent = `${file.name}: 파일이 너무 큽니다 (5MB 초과).`;
    return;
  }
  const text = (await file.text()).replace(/^﻿/, '');
  if (text.includes('\u0000')) {
    fileMsg.textContent = `${file.name}: 텍스트 파일이 아닌 것 같습니다.`;
    return;
  }
  input.value = text;
  fileMsg.textContent = `${file.name}을(를) 불러왔습니다.`;
  update();
}

async function copy(text: string, msg: HTMLElement) {
  try {
    await navigator.clipboard.writeText(text);
    msg.textContent = '복사했습니다. 클립보드 기록에 남을 수 있어요.';
  } catch {
    msg.textContent = '복사하지 못했습니다. 직접 선택해서 복사하세요.';
  }
}

function clearAll() {
  input.value = answer.value = '';
  fileMsg.textContent = $('copy-msg').textContent = '';
  update();
}

let timer: ReturnType<typeof setTimeout> | undefined;
let debounce: ReturnType<typeof setTimeout> | undefined;

input.addEventListener('input', () => {
  clearTimeout(debounce);
  debounce = setTimeout(update, 150);
});
document.querySelectorAll('input[name=group]').forEach((c) => c.addEventListener('change', update));
estimated.addEventListener('change', update);
answer.addEventListener('input', updateRestore);
$<HTMLInputElement>('file').addEventListener('change', (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) loadFile(f);
  (e.target as HTMLInputElement).value = '';
});
$('scan').addEventListener('click', () => {
  clearTimeout(debounce);
  update();
  $('h-result').scrollIntoView({ behavior: 'smooth' });
});
$('copy-masked').addEventListener('click', () => copy(masked.value, $('copy-msg')));
$('copy-restored').addEventListener('click', () => copy(restored.value, $('restore-msg')));
$('clear').addEventListener('click', clearAll);

const drop = $('drop');
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  const f = e.dataTransfer?.files[0];
  if (f) loadFile(f);
});

document.addEventListener('visibilitychange', () => {
  clearTimeout(timer);
  if (document.hidden) timer = setTimeout(clearAll, AUTO_CLEAR_MS);
});

$('js-warn').remove();
const net = $('net');
const policy = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? '';
if (policy.includes("connect-src 'none'")) {
  net.textContent = '🔒 네트워크 차단됨: 이 페이지는 입력 내용을 어디로도 보낼 수 없습니다.';
  net.classList.add('ok');
} else {
  net.textContent = '⚠ 개발 모드: 네트워크 차단(CSP)이 꺼져 있습니다. 배포본에서는 켜집니다.';
  net.classList.add('warn');
}

update();
