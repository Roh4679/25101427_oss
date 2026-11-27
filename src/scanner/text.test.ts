import { describe, expect, it } from "vitest";
import { textDetector } from "../rules/static/text.js";
import type { SourceFile } from "../types.js";
import { lex } from "./source.js";
import { extractTexts, isAllTextExcluded } from "./text.js";

const texts = (path: string, content: string) => extractTexts({ path, content }).map((t) => t.text);
const allText = (files: SourceFile[]) =>
  (textDetector.detect({ root: "/", files, mode: "static" })[0]!.value as { text: string; file: string }[]).map((t) => `${t.file}:${t.text}`);

describe("lex", () => {
  it("주석은 지우고 문자열 속 // 는 남긴다", () => {
    const { code, strings } = lex('const u = "https://x.com"; // 주석\n/* 블록 */ a');
    expect(code).not.toContain("주석");
    expect(code).not.toContain("블록");
    expect(strings.map((s) => s.value)).toEqual(["https://x.com"]);
  });
  it("줄 수를 유지한다", () => {
    expect(lex("a\n/* x\ny */\nb").code.split("\n")).toHaveLength(4);
  });
});

describe("extractTexts", () => {
  it("JSX 텍스트와 보이는 문자열, import·className·짧은 ASCII 토큰 제외", () => {
    const out = texts(
      "app/page.tsx",
      `import Link from "next/link";\nexport default () => <main className="mx-auto p-4"><h1>청약철회 안내</h1><img alt="대표 이미지" /><a href="/terms">약관 보기</a></main>;`,
    );
    expect(out).toEqual(expect.arrayContaining(["청약철회 안내", "대표 이미지", "약관 보기"]));
    expect(out).not.toContain("next/link");
    expect(out).not.toContain("mx-auto p-4");
    expect(out).not.toContain("/terms");
  });
  it("인라인 스크립트 코드 문자열은 텍스트가 아니다", () => {
    expect(texts("a.tsx", "const s = `window.dataLayer=[];function gtag(){}`;")).toEqual([]);
  });
  it("HTML: script·style·주석 제외, title·alt 포함", () => {
    const out = texts("index.html", `<title>AI 글다듬기</title><!-- 개인정보처리방침 --><script>var a = "환불 정책";</script><img alt="로고 이미지"><p>본문 문장</p>`);
    expect(out).toEqual(expect.arrayContaining(["AI 글다듬기", "로고 이미지", "본문 문장"]));
    expect(out.join()).not.toMatch(/개인정보처리방침|환불/);
  });
  it("마크다운 front matter 제외", () => {
    expect(texts("app/docs/refund.md", "---\ntitle: 숨김\n---\n# 환불 정책\n본문")).toEqual(["환불 정책", "본문"]);
  });
  it("i18n 파일은 값만 (키 제외)", () => {
    expect(texts("locales/ko.json", JSON.stringify({ refund_title: "청약철회 안내", nested: { a: "환불 규정" } }))).toEqual(["청약철회 안내", "환불 규정"]);
    expect(texts("src/config.json", JSON.stringify({ a: "청약철회" }))).toEqual([]);
  });
});

describe("all_text 범위 (T25·T26)", () => {
  it("T25 최상위 docs/·README·테스트·주석에만 있는 흔적은 빠진다", () => {
    const out = allText([
      { path: "docs/refund.md", content: "청약철회 안내" },
      { path: "README.md", content: "청약철회 안내" },
      { path: "src/Pay.test.tsx", content: "<p>청약철회 안내</p>" },
      { path: "src/Pay.tsx", content: "// 청약철회 안내\nexport const a = 1;" },
    ]);
    expect(out.join()).not.toContain("청약철회");
  });
  it("T26 app/docs/ 라우트, locales 값, 문자열 상수는 포함", () => {
    const out = allText([
      { path: "app/docs/refund/page.tsx", content: "<p>청약철회 안내</p>" },
      { path: "locales/ko.json", content: JSON.stringify({ k: "청약철회 안내" }) },
      { path: "src/const.ts", content: 'export const REFUND = "청약철회 안내";' },
    ]);
    expect(out).toEqual(["app/docs/refund/page.tsx:청약철회 안내", "locales/ko.json:청약철회 안내", "src/const.ts:청약철회 안내"]);
  });
  it.each([
    ["docs/a.md", true],
    ["app/docs/a.md", false],
    ["CHANGELOG.md", true],
    ["src/README.md", false],
    ["src/__tests__/a.tsx", true],
    ["fixtures/x/a.tsx", true],
  ])("isAllTextExcluded(%s) = %s", (p, v) => expect(isAllTextExcluded(p)).toBe(v));
});
