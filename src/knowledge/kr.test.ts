import { describe, expect, it } from "vitest";
import { loadDefaultKnowledge, unverifiedArticles } from "../scan.js";
import { buildResults } from "../score/results.js";
import type { PageRoute, Result } from "../types.js";
import { evaluate } from "./evaluate.js";

// 실제 지식 베이스(knowledge/kr) 항목마다 통과·실패 케이스 (CLAUDE.md 테스트 규칙)
const KB = loadDefaultKnowledge();

function status(facts: Record<string, unknown>): Record<string, Result> {
  const map = new Map(Object.entries({ scan_mode: "static", ...facts }));
  const evals = new Map(KB.obligations.map((o) => [o.id, evaluate(o, map, "static", KB.labels)]));
  return Object.fromEntries(buildResults(KB.obligations, evals, {}, "static").results.map((r) => [r.id, r]));
}

const form = (consent = { present: true, optional_prechecked: false }) => ({ file: "a.tsx", line: 1, fields: [{ name: "email", kind: "email" }], consent });
const PERSONAL = { collects_personal_info: true, personal_forms: [form()] };
const POLICY_TEXT =
  "개인정보의 처리 목적 / 수집하는 개인정보 항목 / 보유 및 이용 기간 / 처리의 위탁 및 국외 이전 / Google Analytics 사용, 쿠키는 브라우저 설정에서 거부 / 외부 서비스 / 개인정보 보호책임자";
const privacy = (text?: string): PageRoute => ({ path: "/privacy", source: "file-route", ...(text ? { text } : {}) });

describe("knowledge/kr 항목별 통과·실패", () => {
  it("로드되고, 4단계 의무 9개가 있다", () => {
    expect(KB.obligations.map((o) => o.id).sort()).toEqual([
      "accessibility/img-alt",
      "legal/terms-page",
      "privacy/analytics-disclosure",
      "privacy/consent-checkbox",
      "privacy/cookie-consent",
      "privacy/embed-disclosure",
      "privacy/overseas-transfer",
      "privacy/policy-contents",
      "privacy/policy-page",
    ]);
  });

  it("privacy/policy-page: 통과(페이지) / 실패(흔적 없음 → 차단)", () => {
    expect(status({ ...PERSONAL, pages: [privacy()] })["privacy/policy-page"]!.status).toBe("pass");
    expect(status(PERSONAL)["privacy/policy-page"]!.status).toBe("fail");
  });

  it("하위 의무 5개: 본문에 모두 있으면 통과, 처리방침 본문이 비면 실패·확인 필요", () => {
    const facts = {
      ...PERSONAL,
      overseas_services: ["Supabase"],
      analytics_scripts: [{ vendor: "ga4" }],
      external_embeds: [{ domain: "www.youtube.com", tag: "iframe" }],
    };
    const ok = status({ ...facts, pages: [privacy(POLICY_TEXT)] });
    const bad = status({ ...facts, pages: [privacy("개인정보 처리방침")] });
    for (const id of ["privacy/policy-contents", "privacy/overseas-transfer", "privacy/analytics-disclosure", "privacy/embed-disclosure", "privacy/cookie-consent"]) {
      expect(ok[id]!.status, id).toBe("pass");
      expect(bad[id]!.status, id).toMatch(/fail|needs_review/);
    }
    expect(bad["privacy/analytics-disclosure"]!.status).toBe("fail"); // auto
    expect(bad["privacy/policy-contents"]!.status).toBe("needs_review"); // semi
  });

  it("privacy/consent-checkbox: 통과 / 실패(선택 동의 기본 체크)", () => {
    expect(status(PERSONAL)["privacy/consent-checkbox"]!.status).toBe("pass");
    const r = status({ ...PERSONAL, personal_forms: [form({ present: true, optional_prechecked: true })] });
    expect(r["privacy/consent-checkbox"]!.status).toBe("fail");
  });

  it("legal/terms-page: 통과 / 실패(비치명, 차단 아님) / 결제가 있으면 N/A", () => {
    expect(status({ pages: [{ path: "/terms", source: "file-route" }] })["legal/terms-page"]!.status).toBe("pass");
    expect(status({})["legal/terms-page"]).toMatchObject({ status: "fail", grade: "medium" });
    expect(status({ payment_sdks: [{ name: "stripe" }] })["legal/terms-page"]).toMatchObject({ status: "na", naReason: "trigger" });
  });

  it("accessibility/img-alt: 통과 / 부분 통과 / 이미지 없으면 N/A", () => {
    expect(status({ img_missing_alt: { total: 2, missing: 0, items: [] } })["accessibility/img-alt"]!.status).toBe("pass");
    expect(status({ img_missing_alt: { total: 2, missing: 1, items: [{ file: "a.html", line: 3 }] } })["accessibility/img-alt"]).toMatchObject({
      status: "partial",
      score: 0.5,
    });
    expect(status({})["accessibility/img-alt"]!.status).toBe("na");
  });

  it("parent_hint는 표시 이름으로 (T55)", () => {
    const r = status({ ...PERSONAL, analytics_scripts: [{ vendor: "ga4" }] })["privacy/policy-page"]!;
    expect(r.findings[0]!.policyTodo?.map((t) => t.item)).toEqual(["수집 항목: 이메일", "분석 도구: Google Analytics 4", "쿠키 사용 사실과 거부 방법"]);
  });

  it("법적 항목의 조문은 모두 미확인(TODO)이고 references가 있다, 약관은 principle 없음", () => {
    for (const o of KB.obligations) {
      if (o.id === "legal/terms-page") expect(o.principle).toBeUndefined();
      else expect(o.principle, o.id).toMatchObject({ article: "TODO-확인필요", source: null, verified_at: null, references: expect.any(Array) });
    }
    const results = Object.values(status({ ...PERSONAL, pages: [privacy()] }));
    expect(unverifiedArticles(results)).toEqual(["privacy/policy-page", "privacy/policy-contents", "privacy/consent-checkbox"]);
  });
});
