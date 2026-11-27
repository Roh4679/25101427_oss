// 소스 코드를 읽는 작은 도구들 (정규식 기반, CLAUDE.md "처음엔 단순하게").
// ponytail: 간단한 렉서라 JSX 텍스트 안의 따옴표(Don't)나 정규식 리터럴 안의 // 에서 틀릴 수 있다.
//           오탐이 테스트로 확인되면 @babel/parser로 바꾼다.

export interface StringLit {
  value: string;
  start: number; // 여는 따옴표 위치
  end: number; // 닫는 따옴표 다음 위치
}

export interface Lexed {
  code: string; // 주석을 공백으로 바꾼 코드 (길이·줄 번호 유지)
  blanked: string; // code에서 문자열 내용까지 공백으로 바꾼 것 (태그·괄호 찾기용)
  strings: StringLit[];
}

const blank = (s: string) => s.replace(/[^\n]/g, " ");

// 주석 제거 + 문자열 리터럴 수집. 템플릿 리터럴의 ${...}는 값에서 뺀다.
export function lex(src: string): Lexed {
  let code = "";
  let blanked = "";
  const strings: StringLit[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      code += blank(src.slice(i, stop));
      blanked += blank(src.slice(i, stop));
      i = stop;
    } else if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      code += blank(src.slice(i, stop));
      blanked += blank(src.slice(i, stop));
      i = stop;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      let value = "";
      let depth = 0;
      while (j < src.length) {
        const d = src[j]!;
        if (d === "\\") {
          value += src[j + 1] ?? "";
          j += 2;
          continue;
        }
        if (c === "`" && d === "$" && src[j + 1] === "{") depth++;
        else if (depth > 0 && d === "}") depth--;
        else if (depth === 0 && d === c) break;
        else if (depth === 0) value += d;
        if (c !== "`" && d === "\n") break; // 닫히지 않은 따옴표 (JSX 텍스트의 ' 등)
        j++;
      }
      const end = Math.min(j + 1, src.length);
      strings.push({ value, start: i, end });
      code += src.slice(i, end);
      blanked += c + blank(src.slice(i + 1, end - 1)) + (end - i > 1 ? src[end - 1] : "");
      i = end;
    } else {
      code += c;
      blanked += c;
      i++;
    }
  }
  return { code, blanked, strings };
}

// 위치 → 1부터 세는 줄 번호
export function lineIndex(src: string): (pos: number) => number {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === "\n") starts.push(i + 1);
  return (pos) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

export interface Tag {
  name: string;
  attrs: string; // 원문 속성 부분
  start: number;
  end: number;
}

// <name ...> 여는 태그. 속성 안의 {...}(한 단계)에 든 > 는 태그 끝으로 보지 않는다.
export function findTags(code: string, names: string[]): Tag[] {
  const re = new RegExp(`<(${names.join("|")})\\b((?:[^>{]|\\{(?:[^{}]|\\{[^{}]*\\})*\\})*)>`, "g");
  return [...code.matchAll(re)].map((m) => ({ name: m[1]!, attrs: m[2]!, start: m.index, end: m.index + m[0].length }));
}

// 속성 값: name="v", name='v', name={"v"}, name={`v`}. 값 없이 쓰면 "" (있음), 없으면 undefined.
export function attr(attrs: string, name: string): string | undefined {
  const re = new RegExp(`(?:^|\\s)${name}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*["'\`]([^"'\`]*)["'\`]\\s*\\}|\\{([^}]*)\\}))?(?=[\\s/>]|$)`);
  const m = attrs.match(re);
  if (!m) return undefined;
  return m[1] ?? m[2] ?? m[3] ?? (m[4] !== undefined ? `{${m[4]}}` : "");
}

// <name ...>안쪽</name> 블록 (같은 이름이 중첩되지 않는다고 가정)
export function findBlocks(code: string, name: string): { inner: string; start: number; innerStart: number; end: number }[] {
  const re = new RegExp(`<${name}\\b(?:[^>{]|\\{(?:[^{}]|\\{[^{}]*\\})*\\})*>([\\s\\S]*?)</${name}>`, "g");
  return [...code.matchAll(re)].map((m) => ({
    inner: m[1]!,
    start: m.index,
    innerStart: m.index + m[0].indexOf(">") + 1,
    end: m.index + m[0].length,
  }));
}

// 태그·{...}를 뺀 보이는 텍스트
export function visibleText(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, " ")
    .replace(/\{[^{}]*\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const isCodeFile = (path: string) => /\.(js|jsx|ts|tsx|mjs|cjs|vue|svelte)$/.test(path);
export const isHtmlFile = (path: string) => /\.html?$/.test(path);
