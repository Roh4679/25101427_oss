import type { Config } from "../config.js";
import type { EvalOutput } from "../knowledge/evaluate.js";
import { isLiveOnly } from "../knowledge/loader.js";
import type { Obligation } from "../knowledge/schema.js";
import type { Result, Status } from "../types.js";
import { gradeOf, weightOf } from "./index.js";

// docs/scoring.md 3장 1~5번: 평가기 출력 → 상태·점수. 6~9번(집계)은 index.ts의 summarize.

export interface BuildOutput {
  results: Result[];
  warnings: string[];
}

function convert(o: Obligation, ev: EvalOutput, critical: boolean): { status: Status; score: number; mitigated: boolean } {
  if (ev.outcome === "pass") return { status: "pass", score: 1, mitigated: false };
  // 치명 항목: 확실하면 실패(차단), 아니면 확인 필요. 부분 비율은 쓰지 않는다.
  if (critical) return ev.certain ? { status: "fail", score: 0, mitigated: false } : { status: "needs_review", score: 0.5, mitigated: true };
  if (ev.outcome === "partial") return { status: o.check === "auto" ? "partial" : "needs_review", score: ev.score, mitigated: false };
  if (ev.outcome === "unknown") return { status: "needs_review", score: 0.5, mitigated: false };
  return o.check === "auto" ? { status: "fail", score: 0, mitigated: false } : { status: "needs_review", score: 0.5, mitigated: false };
}

export function buildResults(obligations: Obligation[], evals: ReadonlyMap<string, EvalOutput>, config: Config, mode: "static" | "live"): BuildOutput {
  const warnings: string[] = [];
  const known = new Set(obligations.map((o) => o.id));
  const unknownIds = (label: string, ids: string[]) => {
    for (const id of ids) if (!known.has(id)) warnings.push(`${label}의 ${id}: 지식 베이스에 없는 의무라 무시합니다.`);
  };
  unknownIds("confirmations", Object.keys(config.confirmations ?? {}));
  unknownIds("disable", config.disable ?? []);
  unknownIds("factors", Object.keys(config.factors ?? {}));

  const disabled = new Set(config.disable ?? []);
  const results = new Map<string, Result>();

  // 1~4: N/A, 위험도·가중치, 상태 변환, 확인 반영
  for (const o of obligations) {
    const ev = evals.get(o.id);
    if (!ev) throw new Error(`평가 결과가 없습니다: ${o.id}`);
    const factors = config.factors?.[o.id] ?? o.factors;
    const risk = factors.L * factors.I * factors.P;
    const grade = gradeOf(risk);
    const base = {
      id: o.id,
      category: o.category,
      check: o.check,
      factors,
      risk,
      grade,
      weight: weightOf(risk, config.weightMode),
      mitigated: false,
      confirmed: false,
      findings: [],
      ...(o.principle ? { principle: o.principle } : {}),
    };
    const confirmation = config.confirmations?.[o.id];

    // N/A 이유가 여럿이면 사용자 설정 > 모드 > 적용 조건 순으로 하나만 적는다
    const naReason = disabled.has(o.id) ? "disabled" : isLiveOnly(o) && mode === "static" ? "mode" : !ev.applicable ? "trigger" : undefined;
    if (naReason) {
      if (confirmation) warnings.push(`confirmations의 ${o.id}: 해당 없음(N/A) 항목이라 무시합니다.`);
      results.set(o.id, { ...base, status: "na", score: null, naReason });
      continue;
    }

    let { status, score, mitigated } = convert(o, ev, grade === "critical");
    let confirmed = false;
    if (confirmation) {
      if (o.check === "semi" || grade === "critical") {
        status = confirmation;
        score = confirmation === "pass" ? 1 : 0;
        mitigated = false;
        confirmed = true;
      } else {
        warnings.push(`confirmations의 ${o.id}: 자동 확인 항목(auto)에는 쓸 수 없어 무시합니다.`);
      }
    }

    const open = status !== "pass";
    const findings = open ? (ev.findings.length > 0 ? ev.findings : [{ message: o.message ?? o.id, fix: o.fix ?? "" }]) : [];
    results.set(o.id, {
      ...base,
      status,
      score,
      mitigated,
      confirmed,
      findings,
      ...(open && o.message ? { message: o.message } : {}),
      ...(open && o.fix ? { fix: o.fix } : {}),
      ...(!open && ev.configPage ? { configPage: ev.configPage } : {}),
    });
  }

  // 5: 의존 반영. 상위가 pass가 아니면 하위는 na. 상위가 fail이면 하위의 parent_hint를 상위 Finding에 붙인다.
  const byId = new Map(obligations.map((o) => [o.id, o]));
  const done = new Set<string>();
  const hints = new Map<string, { from: string; item: string }[]>();
  const resolve = (o: Obligation): Result => {
    const r = results.get(o.id)!;
    if (done.has(o.id) || !o.depends_on) return (done.add(o.id), r);
    done.add(o.id);
    const parent = resolve(byId.get(o.depends_on)!);
    if (parent.status === "pass") return r;

    const hint = evals.get(o.id)?.hint;
    if (parent.status === "fail" && r.status !== "na" && hint) {
      hints.set(parent.id, [...(hints.get(parent.id) ?? []), { from: o.id, item: hint }]);
    }
    if (r.confirmed) warnings.push(`confirmations의 ${o.id}: 상위 의무(${parent.id})가 통과하지 않아 무시합니다.`);
    const na: Result = r.status === "na" ? r : { ...r, status: "na", score: null, naReason: "dependency", mitigated: false, confirmed: false, findings: [] };
    delete na.message;
    delete na.fix;
    results.set(o.id, na);
    return na;
  };
  obligations.forEach(resolve);

  for (const [parentId, list] of hints) {
    const parent = results.get(parentId)!;
    const [first, ...rest] = parent.findings;
    // 지식 베이스 순서 유지
    const order = (id: string) => obligations.findIndex((o) => o.id === id);
    const policyTodo = [...list].sort((a, b) => order(a.from) - order(b.from));
    results.set(parentId, { ...parent, findings: [{ ...first!, policyTodo }, ...rest] });
  }

  return { results: obligations.map((o) => results.get(o.id)!), warnings };
}
