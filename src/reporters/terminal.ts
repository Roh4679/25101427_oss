import type { Category, Finding, Grade, Report, Result, Status, Verdict } from "../types.js";

// 한국어 표시 이름: docs/spec/report-schema.md 2장, 배치: 6장
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

export const GRADE_LABEL: Record<Grade, string> = { critical: "치명", high: "높음", medium: "보통", low: "낮음" };

const MAX_LOCATIONS = 10;

// 있어서 문제: "파일:줄" 또는 URL. 같은 위치는 한 번만, 많으면 앞의 10곳만.
function locations(findings: Finding[]): string {
  const all = [
    ...new Set(
      findings.flatMap((f) => {
        const l = f.location;
        if (l?.file) return [l.line ? `${l.file}:${l.line}` : l.file];
        return l?.url ? [l.url] : [];
      }),
    ),
  ];
  const shown = all.slice(0, MAX_LOCATIONS).join(", ");
  return all.length > MAX_LOCATIONS ? `${shown} 외 ${all.length - MAX_LOCATIONS}곳` : shown;
}

// 없어서 문제: 찾아본 범위
function searched(findings: Finding[]): string {
  const s = findings.find((f) => f.searched)?.searched;
  if (!s) return "";
  const footer = s.footer.length > 0 ? `푸터 ${s.footer.join(", ")}` : "푸터 없음";
  return `라우트 ${s.routes}개, ${footer}, 화면 텍스트 ${s.texts}곳`;
}

function itemLines(r: Result, head: string): string[] {
  const out = [`${head}[${GRADE_LABEL[r.grade]}] ${r.id}${r.message ? ` — ${r.message}` : ""}`];
  const indent = " ".repeat(head.length);
  const where = locations(r.findings);
  const scope = searched(r.findings);
  if (r.status !== "fail") out.push(`${indent}상태: ${STATUS_LABEL[r.status]}`);
  if (where) out.push(`${indent}위치: ${where}`);
  if (scope) out.push(`${indent}찾아본 곳: ${scope}`);
  if (r.fix) out.push(`${indent}해결: ${r.fix}`);
  const todo = r.findings.flatMap((f) => f.policyTodo ?? []);
  if (todo.length > 0) {
    out.push(`${indent}새로 만들 처리방침에 포함할 항목:`);
    for (const t of todo) out.push(`${indent}  - ${t.item}`);
  }
  if (r.principle) out.push(`${indent}근거: ${r.principle.law} ${r.principle.article} (확인일 ${r.principle.verified_at})`);
  out.push(`${indent}가중치 근거: L${r.factors.L} × I${r.factors.I} × P${r.factors.P} = ${r.risk}`);
  if (r.mitigated) out.push(`${indent}\`--live\`로 다시 확인하거나 \`confirmations\`에 확인 결과를 적으세요.`);
  return out;
}

export function renderTerminal(report: Report): string {
  const { score } = report;
  const blockedNote = score.blockers.length > 0 ? ` (치명 항목 ${score.blockers.length}개 실패)` : "";
  const lines = [
    `vibe-signoff ${report.tool.version} 검사 결과 — ${report.project.name} (${report.project.framework})`,
    "",
    `  종합 점수   ${score.total} / 100   ${VERDICT_LABEL[score.verdict]}${blockedNote}`,
    "",
    "  영역별",
  ];
  for (const [cat, value] of Object.entries(score.categories) as [Category, number | null][]) {
    lines.push(`  ${CATEGORY_LABEL[cat]}: ${value === null ? "해당 없음" : `${value}점`}`);
  }

  // 먼저 고칠 것: 차단을 일으킨 치명 실패
  const blockers = report.results.filter((r) => score.blockers.includes(r.id));
  if (blockers.length > 0) {
    lines.push("", "  ⛔ 먼저 고칠 것");
    blockers.forEach((r, i) => lines.push(...itemLines(r, `  ${i + 1}. `)));
  }

  // 나머지: 가중치가 큰 것부터 (같으면 지식 베이스 순서, sort는 안정 정렬)
  const open = report.results
    .filter((r) => r.status !== "pass" && r.status !== "na" && !score.blockers.includes(r.id))
    .sort((a, b) => b.weight - a.weight);
  if (open.length > 0) {
    lines.push("", "  확인할 항목");
    for (const r of open) lines.push(...itemLines(r, "  - "));
  }

  const waiting = report.results.filter((r) => r.naReason === "dependency");
  const unverified = report.results.filter((r) => r.configPage && !r.configPage.verified);
  if (waiting.length > 0 || unverified.length > 0) {
    lines.push("", "  참고");
    for (const r of unverified) lines.push(`  - ${r.id} — 설정으로 지정됨(미검증): ${r.configPage!.url}`);
    for (const r of waiting) lines.push(`  - ${r.id} — 해당 없음: 상위 의무가 통과하면 평가합니다.`);
  }
  if (report.results.length === 0) lines.push("", "  적용된 검사 항목이 없습니다 (지식 베이스가 비어 있음).");

  lines.push("", `  ※ ${report.disclaimer}`, "");
  return lines.join("\n");
}
