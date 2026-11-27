import type { Category, Report, Status, Verdict } from "../types.js";

// 한국어 표시 이름: docs/spec/report-schema.md 2장
export const VERDICT_LABEL: Record<Verdict, string> = {
  ready: "✅ 배포 가능",
  ready_with_fixes: "⚠️ 보완 후 배포 권장",
  needs_work: "❌ 보완 필요",
  blocked: "⛔ 배포 차단",
};

export const STATUS_LABEL: Record<Status, string> = {
  pass: "통과",
  partial: "부분 통과",
  needs_review: "확인 필요",
  fail: "실패",
  na: "해당 없음",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  security: "보안",
  privacy: "개인정보",
  commerce: "결제·상거래",
  advertising: "광고·콘텐츠",
  accessibility: "접근성",
  ux: "운영·UX",
};

export function renderTerminal(report: Report): string {
  const { score } = report;
  const lines = [
    `vibe-signoff ${report.tool.version} — ${report.project.name} (${report.project.framework})`,
    "",
    `점수 ${score.total}점  ${VERDICT_LABEL[score.verdict]}`,
  ];
  if (score.blockers.length > 0) lines.push(`차단 원인: ${score.blockers.join(", ")}`);

  lines.push("", "영역별 점수");
  for (const [cat, value] of Object.entries(score.categories) as [Category, number | null][]) {
    lines.push(`  ${CATEGORY_LABEL[cat]}: ${value === null ? "해당 없음" : `${value}점`}`);
  }

  const open = report.results.filter((r) => r.status !== "pass" && r.status !== "na");
  if (open.length > 0) {
    lines.push("", "확인할 항목");
    for (const r of open) {
      lines.push(`  [${STATUS_LABEL[r.status]}] ${r.id}${r.message ? ` — ${r.message}` : ""}`);
      if (r.fix) lines.push(`      해결: ${r.fix}`);
      const todo = r.findings.flatMap((f) => f.policyTodo ?? []);
      if (todo.length > 0) {
        lines.push("      새로 만들 처리방침에 포함할 항목:");
        for (const t of todo) lines.push(`        - ${t.item}`);
      }
      if (r.mitigated) lines.push("      `--live`로 다시 확인하거나 `confirmations`에 확인 결과를 적으세요.");
    }
  }
  const waiting = report.results.filter((r) => r.naReason === "dependency");
  const unverified = report.results.filter((r) => r.configPage && !r.configPage.verified);
  if (waiting.length > 0 || unverified.length > 0) {
    lines.push("", "참고");
    for (const r of unverified) lines.push(`  [통과] ${r.id} — 설정으로 지정됨(미검증): ${r.configPage!.url}`);
    for (const r of waiting) lines.push(`  [해당 없음] ${r.id} — 상위 의무가 통과하면 평가합니다.`);
  }
  if (report.results.length === 0) lines.push("", "적용된 검사 항목이 없습니다 (지식 베이스가 비어 있음).");

  lines.push("", report.disclaimer, "");
  return lines.join("\n");
}
