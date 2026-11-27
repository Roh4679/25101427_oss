import { describe, expect, it } from "vitest";
import type { Category, Result, Status } from "../types.js";
import { exitCodeOf, gradeOf, summarize, weightOf } from "./index.js";

// 가중치 w, 점수 s인 결과 하나
function r(weight: number, score: number | null, opts: { status?: Status; category?: Category; critical?: boolean; id?: string } = {}): Result {
  const status = opts.status ?? (score === null ? "na" : score === 1 ? "pass" : score === 0 ? "fail" : "needs_review");
  return {
    id: opts.id ?? `x/${Math.random()}`,
    category: opts.category ?? "security",
    check: "auto",
    status,
    score,
    factors: { L: 1, I: 1, P: 1 },
    risk: 1,
    grade: opts.critical ? "critical" : "high",
    weight,
    mitigated: false,
    confirmed: false,
    findings: [],
  };
}

// 가중 평균이 정확히 p%인 결과 목록
const avg = (p: number) => [r(1000, p / 100, { status: "partial" })];

describe("등급·가중치", () => {
  it.each([
    [18, "critical", 10], [27, "critical", 10], [12, "high", 5], [17, "high", 5],
    [6, "medium", 3], [11, "medium", 3], [5, "low", 1], [1, "low", 1],
  ] as const)("risk %i → %s, 가중치 %i", (risk, grade, w) => {
    expect(gradeOf(risk)).toBe(grade);
    expect(weightOf(risk)).toBe(w);
  });

  it("T34 weightMode raw → 가중치 = risk", () => {
    expect(weightOf(12, "raw")).toBe(12);
  });
});

describe("총점·판정 경계 (scoring.md T27~T35)", () => {
  it("T27 89.9 → 89, ready_with_fixes", () => {
    expect(summarize(avg(89.9))).toMatchObject({ total: 89, verdict: "ready_with_fixes" });
  });
  it("T28 90.0 → 90, ready", () => {
    expect(summarize(avg(90))).toMatchObject({ total: 90, verdict: "ready" });
  });
  it("T29 69.9 → 69 needs_work / 70.0 → 70 ready_with_fixes", () => {
    expect(summarize(avg(69.9))).toMatchObject({ total: 69, verdict: "needs_work" });
    expect(summarize(avg(70))).toMatchObject({ total: 70, verdict: "ready_with_fixes" });
  });
  it("T30 차단 + 92 → 59, blocked", () => {
    const s = summarize([r(10, 0, { critical: true, id: "a/b" }), r(115, 1)]);
    expect(s).toMatchObject({ total: 59, verdict: "blocked", blockers: ["a/b"] });
  });
  it("T31 차단 + 40 → 40, blocked", () => {
    const s = summarize([r(10, 0, { critical: true }), r(10, 0.8)]);
    expect(s).toMatchObject({ total: 40, verdict: "blocked" });
  });
  it("치명 needs_review는 차단하지 않는다", () => {
    expect(summarize([r(10, 0.5, { critical: true, status: "needs_review" })]).verdict).toBe("needs_work");
  });
  it("N/A는 분모에서 빠진다", () => {
    expect(summarize([r(10, null), r(5, 1)]).total).toBe(100);
  });
  it("적용 항목 0개 → 100, ready", () => {
    expect(summarize([])).toMatchObject({ total: 100, verdict: "ready", blockers: [] });
  });
  it("signup-app 정답지 계산: 29.5 / 52 → 56, 치명 실패 2개로 blocked", () => {
    const s = summarize([
      r(10, 1), r(5, 1), r(10, 0, { critical: true, id: "privacy/policy-page" }),
      r(10, 0, { critical: true, id: "privacy/consent-checkbox" }), r(5, 0.5), r(3, 1), r(5, 1), r(3, 1), r(1, 1),
    ]);
    expect(s).toMatchObject({ total: 56, verdict: "blocked", blockers: ["privacy/policy-page", "privacy/consent-checkbox"] });
  });
  it("T35 종료 코드", () => {
    expect([exitCodeOf("ready"), exitCodeOf("ready_with_fixes"), exitCodeOf("needs_work"), exitCodeOf("blocked")]).toEqual([0, 0, 1, 1]);
  });
});

describe("영역 점수", () => {
  it("T32 79.6 → 79 (같은 내림)", () => {
    expect(summarize([r(1000, 0.796, { status: "partial", category: "privacy" })]).categories.privacy).toBe(79);
  });
  it("T33 적용 항목 없는 영역 → null, 차단 상한은 총점에만", () => {
    const s = summarize([r(10, 0, { critical: true, category: "security" }), r(1000, 1, { category: "ux" })]);
    expect(s.categories.commerce).toBeNull();
    expect(s.categories.ux).toBe(100);
    expect(s.total).toBe(59);
  });
});
