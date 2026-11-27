import type { Category, Grade, Result, ScoreSummary, Verdict } from "../types.js";

// 규칙: docs/scoring.md. 2단계에서는 2번(등급·가중치)과 6~9번(집계)만 구현한다.
// 1·3·4·5번(N/A, 상태 변환, 확인 반영, 의존 반영)은 3단계에서 추가한다.

export const CATEGORIES: Category[] = ["security", "privacy", "commerce", "advertising", "accessibility", "ux"];

const BLOCKED_CAP = 59;
const GRADE_WEIGHT: Record<Grade, number> = { critical: 10, high: 5, medium: 3, low: 1 };

export function gradeOf(risk: number): Grade {
  if (risk >= 18) return "critical";
  if (risk >= 12) return "high";
  if (risk >= 6) return "medium";
  return "low";
}

export function weightOf(risk: number, mode: "grade" | "raw" = "grade"): number {
  return mode === "raw" ? risk : GRADE_WEIGHT[gradeOf(risk)];
}

// 부동소수 오차로 90이 89.999…가 되어 내려가지 않도록 아주 작은 값을 더한 뒤 내림한다.
function weightedFloor(results: Result[]): number | null {
  const applied = results.filter((r) => r.status !== "na" && r.score !== null);
  if (applied.length === 0) return null;
  const den = applied.reduce((s, r) => s + r.weight, 0);
  const num = applied.reduce((s, r) => s + r.weight * (r.score ?? 0), 0);
  return Math.floor((num / den) * 100 + 1e-9);
}

export function verdictOf(total: number, blocked: boolean): Verdict {
  if (blocked) return "blocked";
  if (total >= 90) return "ready";
  if (total >= 70) return "ready_with_fixes";
  return "needs_work";
}

export function summarize(results: Result[]): ScoreSummary {
  const blockers = results.filter((r) => r.grade === "critical" && r.status === "fail").map((r) => r.id);
  const raw = weightedFloor(results) ?? 100;
  const total = blockers.length > 0 ? Math.min(raw, BLOCKED_CAP) : raw;
  const categories = Object.fromEntries(
    CATEGORIES.map((c) => [c, weightedFloor(results.filter((r) => r.category === c))]),
  ) as Record<Category, number | null>;
  return { total, verdict: verdictOf(total, blockers.length > 0), blockers, categories };
}

export function exitCodeOf(verdict: Verdict): 0 | 1 {
  return verdict === "ready" || verdict === "ready_with_fixes" ? 0 : 1;
}
