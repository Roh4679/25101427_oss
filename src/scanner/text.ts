import type { SourceFile } from "../types.js";
import { isCodeFile, isHtmlFile, lex, lineIndex } from "./source.js";

// 사용자에게 보이는 텍스트 추출 (docs/spec/facts.md 4.1)

export type TextSource = "jsx" | "string" | "markdown" | "html" | "i18n";
export interface TextPiece {
  text: string;
  source: TextSource;
  file: string;
  line?: number;
}

const HAS_LETTER = /\p{L}/u;
// 공백 없는 ASCII 토큰("post", "/api/signup", "afterInteractive")은 화면 문구가 아니다
const ASCII_TOKEN = /^[\x21-\x7e]+$/;
const SKIP_BEFORE_STRING = /(?:\b(?:from|import)\s*|\b(?:require|import)\s*\(\s*|\b(?:className|class|style)\s*=\s*\{?\s*)$/;
const CODE_LIKE = /=>|&&|\|\||[;=]\s*$/;
// 한글이 없고 ; { } 가 들어간 문자열은 인라인 스크립트 코드다 (예: gtag 초기화)
const SCRIPT_LIKE = /^[^\p{Script=Hangul}]*[;{}][^\p{Script=Hangul}]*$/u;
const VISIBLE_ATTRS = ["alt", "title", "placeholder", "aria-label", "label"];

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const keep = (s: string) => s.length >= 2 && HAS_LETTER.test(s) && !ASCII_TOKEN.test(s);

function fromCode(f: SourceFile, src: string): TextPiece[] {
  const { code, blanked, strings } = lex(src);
  const line = lineIndex(src);
  const out: TextPiece[] = [];
  for (const s of strings) {
    const text = clean(s.value);
    if (!keep(text) || SCRIPT_LIKE.test(text) || SKIP_BEFORE_STRING.test(code.slice(Math.max(0, s.start - 40), s.start))) continue;
    out.push({ text, source: "string", file: f.path, line: line(s.start) });
  }
  // JSX 텍스트: > 와 < 사이 (문자열 내용은 가려 둔 blanked에서 위치를 찾는다)
  for (const m of blanked.matchAll(/>([^<>{}]+)</g)) {
    const text = clean(code.slice(m.index + 1, m.index + 1 + m[1]!.length));
    if (keep(text) && !CODE_LIKE.test(text)) out.push({ text, source: "jsx", file: f.path, line: line(m.index + 1) });
  }
  return out;
}

function fromHtml(f: SourceFile, src: string): TextPiece[] {
  const stripped = src.replace(/<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, (m) => m.replace(/[^\n]/g, " "));
  const line = lineIndex(src);
  const out: TextPiece[] = [];
  for (const m of stripped.matchAll(/>([^<>]+)</g)) {
    const text = clean(m[1]!);
    if (keep(text)) out.push({ text, source: "html", file: f.path, line: line(m.index + 1) });
  }
  for (const m of stripped.matchAll(new RegExp(`\\s(?:${VISIBLE_ATTRS.join("|")})\\s*=\\s*"([^"]*)"`, "g"))) {
    const text = clean(m[1]!);
    if (keep(text)) out.push({ text, source: "html", file: f.path, line: line(m.index) });
  }
  return out;
}

function fromMarkdown(f: SourceFile, src: string): TextPiece[] {
  const body = src.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, (m) => m.replace(/[^\n]/g, ""));
  return body.split("\n").flatMap((l, i) => {
    const text = clean(l.replace(/^[#>*\-\s]+/, ""));
    return keep(text) ? [{ text, source: "markdown" as const, file: f.path, line: i + 1 }] : [];
  });
}

function jsonStrings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(jsonStrings);
  if (v && typeof v === "object") return Object.values(v).flatMap(jsonStrings);
  return [];
}

const I18N = /(?:^|\/)(?:locales|messages|i18n|lang)\/.+\.json$/;

function fromI18n(f: SourceFile, src: string): TextPiece[] {
  try {
    return jsonStrings(JSON.parse(src))
      .map(clean)
      .filter(keep)
      .map((text) => ({ text, source: "i18n" as const, file: f.path }));
  } catch {
    return [];
  }
}

// 파일 하나의 보이는 텍스트 (all_text 제외 규칙은 적용하지 않는다)
export function extractTexts(f: SourceFile): TextPiece[] {
  if (f.content === undefined) return [];
  if (isCodeFile(f.path)) return fromCode(f, f.content);
  if (isHtmlFile(f.path)) return fromHtml(f, f.content);
  if (/\.mdx?$/.test(f.path)) return fromMarkdown(f, f.content);
  if (I18N.test(f.path)) return fromI18n(f, f.content);
  return [];
}

// all_text에서 빼는 파일 (facts.md 4.1)
const TOP_LEVEL_DOC = /^(?:docs\/|(?:README|CHANGELOG|CONTRIBUTING|LICENSE)[^/]*$)/i;
const TEST_FILE = /(?:^|\/)(?:__tests__|__mocks__|fixtures)\/|\.(?:test|spec)\.[^/]+$/;

export const isAllTextExcluded = (path: string) => TOP_LEVEL_DOC.test(path) || TEST_FILE.test(path);
