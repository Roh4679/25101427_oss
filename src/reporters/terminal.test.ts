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

const minor = (over: Partial<Result>) => result({ grade: "low", factors: { L: 1, I: 1, P: 3 }, risk: 3, weight: 1, ...over });

describe("renderTerminal", () => {
  it("빈 결과: 100점 배포 가능, 영역은 해당 없음", () => {
    const out = renderTerminal(report([]));
    expect(out).toContain("종합 점수   100 / 100   ✅ 배포 가능");
    expect(out).toContain("운영·UX: 해당 없음");
    expect(out).toContain("※ 면책 문구");
  });

  it("치명 실패는 '먼저 고칠 것'에 번호를 붙여 맨 위에, 등급·근거·가중치 근거와 함께", () => {
    const out = renderTerminal(
      report([
        minor({ id: "ux/button-labels", status: "needs_review", score: 0.5, message: "버튼 문구 확인" }),
        result({
          message: "개인정보 처리방침이 보이지 않습니다.",
          fix: "처리방침을 만드세요.",
          principle: { law: "개인정보 보호법", article: "TODO-확인필요", source: "https://www.law.go.kr", verified_at: "2026-11-27" },
        }),
      ]),
    );
    expect(out).toContain("⛔ 배포 차단 (치명 항목 1개 실패)");
    const first = out.indexOf("⛔ 먼저 고칠 것");
    const rest = out.indexOf("확인할 항목");
    expect(first).toBeGreaterThan(0);
    expect(rest).toBeGreaterThan(first);
    expect(out).toContain("  1. [치명] privacy/policy-page — 개인정보 처리방침이 보이지 않습니다.");
    expect(out).toContain("     근거: 개인정보 보호법 TODO-확인필요 (확인일 2026-11-27)");
    expect(out).toContain("     가중치 근거: L3 × I2 × P3 = 18");
    expect(out).toContain("  - [낮음] ux/button-labels — 버튼 문구 확인\n    상태: 확인 필요");
  });

  it("확인할 항목은 가중치가 큰 것부터", () => {
    const out = renderTerminal(
      report([
        minor({ id: "ux/button-labels", status: "needs_review", score: 0.5 }),
        result({ id: "commerce/refund-policy", status: "needs_review", score: 0.5, mitigated: true }),
      ]),
    );
    expect(out.indexOf("commerce/refund-policy")).toBeLessThan(out.indexOf("ux/button-labels"));
    expect(out).toContain("`confirmations`에 확인 결과를 적으세요");
  });

  it("있어서 문제: 위치를 파일:줄로 (중복 제거, 10곳 넘으면 줄임)", () => {
    const loc = (file: string, line?: number) => ({ location: { file, ...(line ? { line } : {}) }, message: "m", fix: "f" });
    const out = renderTerminal(
      report([
        minor({
          id: "ux/button-labels", status: "needs_review",
          findings: [loc("components/Banner.tsx", 9), loc("components/Banner.tsx", 9), loc(".env"), { location: { url: "https://x.com/a" }, message: "m", fix: "f" }],
        }),
        minor({ id: "accessibility/img-alt", status: "partial", findings: Array.from({ length: 12 }, (_, i) => loc("app/page.tsx", i + 1)) }),
      ]),
    );
    expect(out).toContain("위치: components/Banner.tsx:9, .env, https://x.com/a\n");
    expect(out).toContain("app/page.tsx:10 외 2곳");
    expect(out).not.toContain("app/page.tsx:11");
  });

  it("없어서 문제: 찾아본 곳 (라우트 수, 푸터 파일, 화면 텍스트 수)", () => {
    const f = (footer: string[]) => [{ message: "m", fix: "f", searched: { routes: 3, footer, texts: 120 } }];
    expect(renderTerminal(report([result({ findings: f(["app/layout.tsx"]) })]))).toContain(
      "찾아본 곳: 라우트 3개, 푸터 app/layout.tsx, 화면 텍스트 120곳",
    );
    expect(renderTerminal(report([result({ findings: f([]) })]))).toContain("푸터 없음");
  });

  it("처리방침 포함 항목, 하위 의무 대기, 미검증 설정 페이지", () => {
    const out = renderTerminal(
      report([
        result({ findings: [{ message: "m", fix: "f", policyTodo: [{ from: "privacy/analytics-disclosure", item: "분석 도구: Google Analytics 4" }] }] }),
        result({ id: "privacy/cookie-consent", status: "na", score: null, naReason: "dependency" }),
        result({ id: "legal/terms-page", status: "pass", score: 1, configPage: { url: "https://x.notion.site/t", verified: false } }),
      ]),
    );
    expect(out).toContain("새로 만들 처리방침에 포함할 항목:\n       - 분석 도구: Google Analytics 4");
    expect(out).toContain("privacy/cookie-consent — 해당 없음: 상위 의무가 통과하면 평가합니다.");
    expect(out).toContain("설정으로 지정됨(미검증): https://x.notion.site/t");
  });

  it("사용자 메시지에 금지 표현이 없다", () => {
    const out = renderTerminal(report([result({})]));
    expect(out).not.toMatch(/위법|불법|위반입니다/);
  });
});
