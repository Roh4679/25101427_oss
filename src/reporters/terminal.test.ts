import { describe, expect, it } from "vitest";
import { summarize } from "../score/index.js";
import type { Report, Result } from "../types.js";
import { renderTerminal } from "./terminal.js";

const result = (over: Partial<Result>): Result => ({
  id: "privacy/policy-page", category: "privacy", check: "auto", status: "fail", score: 0,
  factors: { L: 3, I: 2, P: 3 }, risk: 18, grade: "critical", weight: 10,
  mitigated: false, confirmed: false, findings: [], ...over,
});

const report = (results: Result[]): Report => ({
  schemaVersion: 1,
  tool: { name: "vibe-signoff", version: "0.0.0" },
  project: { name: "demo", framework: "next-app" },
  options: { mode: "static", network: true, region: "kr" },
  score: summarize(results),
  results,
  disclaimer: "면책 문구",
});

describe("renderTerminal", () => {
  it("빈 결과: 100점 배포 가능, 영역은 해당 없음", () => {
    const out = renderTerminal(report([]));
    expect(out).toContain("점수 100점  ✅ 배포 가능");
    expect(out).toContain("운영·UX: 해당 없음");
    expect(out).toContain("면책 문구");
  });

  it("차단: 차단 원인과 한국어 상태를 보여 준다", () => {
    const out = renderTerminal(report([result({ message: "개인정보 처리방침이 보이지 않습니다." })]));
    expect(out).toContain("⛔ 배포 차단");
    expect(out).toContain("차단 원인: privacy/policy-page");
    expect(out).toContain("[실패] privacy/policy-page — 개인정보 처리방침이 보이지 않습니다.");
  });

  it("완화된 치명 항목에는 재확인 안내", () => {
    const out = renderTerminal(report([result({ status: "needs_review", score: 0.5, mitigated: true })]));
    expect(out).toContain("[확인 필요]");
    expect(out).toContain("`confirmations`에 확인 결과를 적으세요");
  });

  it("처리방침 포함 항목, 하위 의무 대기, 미검증 설정 페이지", () => {
    const out = renderTerminal(
      report([
        result({ findings: [{ message: "m", fix: "f", policyTodo: [{ from: "privacy/analytics-disclosure", item: "분석 도구: ga4" }] }] }),
        result({ id: "privacy/cookie-consent", status: "na", score: null, naReason: "dependency" }),
        result({ id: "legal/terms-page", status: "pass", score: 1, configPage: { url: "https://x.notion.site/t", verified: false } }),
      ]),
    );
    expect(out).toContain("새로 만들 처리방침에 포함할 항목:\n        - 분석 도구: ga4");
    expect(out).toContain("[해당 없음] privacy/cookie-consent — 상위 의무가 통과하면 평가합니다.");
    expect(out).toContain("설정으로 지정됨(미검증): https://x.notion.site/t");
  });

  it("Finding 위치를 파일:줄로 보여 준다 (중복 제거, 10곳 넘으면 줄임)", () => {
    const loc = (file: string, line?: number) => ({ location: { file, ...(line ? { line } : {}) }, message: "m", fix: "f" });
    const out = renderTerminal(
      report([
        result({
          id: "ux/button-labels", grade: "low", status: "needs_review",
          findings: [loc("components/Banner.tsx", 9), loc("components/Banner.tsx", 9), loc(".env"), { location: { url: "https://x.com/a" }, message: "m", fix: "f" }],
        }),
        result({ id: "accessibility/img-alt", grade: "medium", status: "partial", findings: Array.from({ length: 12 }, (_, i) => loc("app/page.tsx", i + 1)) }),
      ]),
    );
    expect(out).toContain("      위치: components/Banner.tsx:9, .env, https://x.com/a\n");
    expect(out).toContain("app/page.tsx:10 외 2곳");
    expect(out).not.toContain("app/page.tsx:11");
  });

  it("사용자 메시지에 금지 표현이 없다", () => {
    const out = renderTerminal(report([result({})]));
    expect(out).not.toMatch(/위법|불법|위반입니다/);
  });
});
