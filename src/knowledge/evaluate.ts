import type { Finding, PageRoute } from "../types.js";
import { hintLines, hintPlaceholders, textList } from "./loader.js";
import { matchItem, normalize, type PatternItem } from "./normalize.js";
import type { Labels } from "./labels.js";
import type { Condition, Evidence, Obligation } from "./schema.js";

// trigger·evidence 평가기 (docs/spec/evidence-dsl.md). 순수 함수: Fact만 보고 판단한다.

export type FactMap = ReadonlyMap<string, unknown>;
export type Outcome = "pass" | "partial" | "unknown" | "fail";

export interface EvalOutput {
  id: string;
  applicable: boolean;
  outcome: Outcome;
  score: number;
  certain: boolean;
  reasons: string[];
  findings: Finding[];
  configPage?: { url: string; verified: boolean; httpStatus?: number };
  hints?: string[]; // 채워진 parent_hint 줄들. 상위 의무가 fail이면 점수 모델이 상위 Finding에 붙인다
}

interface Step {
  outcome: Outcome;
  score: number;
  reasons: string[];
  findings: Finding[];
  pages: PageRoute[]; // 증거가 맞춘 페이지 (확실성 판정, configPage)
}

// 참 판정: 없음·false·빈 배열·빈 문자열·0 → 거짓
export function isTruthy(v: unknown): boolean {
  if (v === undefined || v === null || v === false) return false;
  if (Array.isArray(v) || typeof v === "string") return v.length > 0;
  if (typeof v === "number") return v !== 0;
  return true;
}

export function evalCondition(c: Condition, facts: FactMap): boolean {
  if (typeof c === "string") return isTruthy(facts.get(c));
  if ("all" in c) return c.all.every((x) => evalCondition(x, facts));
  if ("any" in c) return c.any.some((x) => evalCondition(x, facts));
  if ("not" in c) return !evalCondition(c.not, facts);
  return JSON.stringify(facts.get(c.fact)) === JSON.stringify(c.eq);
}

// 점 경로로 값 꺼내기. 중간·끝의 배열은 펼친다 (fields.kind).
export function pluck(v: unknown, path: string[]): unknown[] {
  if (Array.isArray(v)) return v.flatMap((x) => pluck(x, path));
  if (path.length === 0) return [v];
  if (v !== null && typeof v === "object") return pluck((v as Record<string, unknown>)[path[0]!], path.slice(1));
  return [];
}

const splitPath = (field?: string) => (field ? field.split(".") : []);
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);
const strings = (vs: unknown[]) => vs.filter((x): x is string => typeof x === "string");

function locOf(el: unknown): Finding["location"] {
  if (el === null || typeof el !== "object") return undefined;
  const { file, line, url } = el as { file?: unknown; line?: unknown; url?: unknown };
  const loc = {
    ...(typeof file === "string" ? { file } : {}),
    ...(typeof line === "number" ? { line } : {}),
    ...(typeof url === "string" ? { url } : {}),
  };
  return Object.keys(loc).length > 0 ? loc : undefined;
}

// kind가 같거나, path·link_text·title에 단어가 들어간 페이지 (외부 링크 포함)
function findPages(pages: PageRoute[], ref: { kind?: string; match: string[] }): PageRoute[] {
  const words = ref.match.map(normalize);
  return pages.filter(
    (p) =>
      (ref.kind !== undefined && p.kind === ref.kind) ||
      [p.path, p.link_text, p.title].some((v) => v !== undefined && words.some((w) => normalize(v).includes(w))),
  );
}

const step = (outcome: Outcome, score: number, reasons: string[] = [], findings: Finding[] = [], pages: PageRoute[] = []): Step => ({
  outcome,
  score,
  reasons,
  findings,
  pages,
});

// 텍스트 조각마다 정규화해 검사한다 (조각 경계를 넘는 일치는 만들지 않는다).
function textCheck(pieces: string[], list: PatternItem[], all: boolean): Step {
  const norm = pieces.map(normalize);
  const found = list.filter((item) => norm.some((t) => matchItem(t, item)));
  if (!all) return found.length > 0 ? step("pass", 1) : step("fail", 0, ["text_missing"]);
  const ratio = found.length / list.length;
  if (ratio === 1) return step("pass", 1);
  return ratio === 0 ? step("fail", 0, ["text_missing"]) : step("partial", ratio, ["text_partial"]);
}

interface Ctx {
  o: Obligation;
  facts: FactMap;
  mode: "static" | "live";
  finding: (el?: unknown) => Finding;
}

function patternsOf(ctx: Ctx, e: Evidence): { list: PatternItem[]; all: boolean } {
  const raw = textList(e) ?? [];
  const body = ("page_text_contains" in e ? e.page_text_contains : "text_contains" in e ? e.text_contains : {}) as { all_of?: unknown };
  return { list: raw === "$trace" ? (ctx.o.trace ?? []) : raw, all: body.all_of !== undefined };
}

function evalEvidence(ctx: Ctx, e: Evidence): Step | "skip" {
  if (e.mode === "live" && ctx.mode !== "live") return "skip";
  const { facts } = ctx;

  if ("page_exists" in e) {
    const hit = findPages(asArray(facts.get("pages")) as PageRoute[], e.page_exists);
    return hit.length > 0 ? step("pass", 1, [], [], hit) : step("fail", 0, ["page_missing"]);
  }
  if ("page_text_contains" in e) {
    const hit = findPages(asArray(facts.get("pages")) as PageRoute[], e.page_text_contains.page);
    if (hit.length === 0) return step("fail", 0, ["page_missing"]);
    const texts = strings(hit.map((p) => p.text));
    if (texts.length === 0) return step("unknown", 0, ["page_text_unknown"], [], hit);
    const { list, all } = patternsOf(ctx, e);
    return { ...textCheck(texts, list, all), pages: hit };
  }
  if ("truthy" in e) return isTruthy(facts.get(e.truthy)) ? step("pass", 1) : step("fail", 0, ["fact_false"]);
  if ("falsy" in e) {
    const v = facts.get(e.falsy);
    if (!isTruthy(v)) return step("pass", 1);
    return step("fail", 0, ["fact_true"], (Array.isArray(v) ? v : [v]).map(ctx.finding));
  }
  if ("coverage" in e) {
    const v = facts.get(e.coverage) as { total?: number; missing?: number; items?: unknown[] } | undefined;
    if (!v?.total) return step("pass", 1);
    const s = 1 - (v.missing ?? 0) / v.total;
    if (s >= 1) return step("pass", 1);
    const findings = (v.items ?? []).map(ctx.finding);
    return s <= 0 ? step("fail", 0, ["coverage_zero"], findings) : step("partial", s, ["coverage_partial"], findings);
  }
  if ("text_contains" in e) {
    const { fact, field } = e.text_contains;
    const { list, all } = patternsOf(ctx, e);
    return textCheck(strings(pluck(facts.get(fact), splitPath(field))), list, all);
  }
  if ("text_absent" in e) {
    const { fact, field, exact } = e.text_absent;
    const { list } = patternsOf(ctx, e);
    const hits = asArray(facts.get(fact)).filter((el) =>
      strings(pluck(el, splitPath(field))).some((t) => list.some((item) => matchItem(normalize(t), item, exact))),
    );
    return hits.length === 0 ? step("pass", 1) : step("fail", 0, ["text_present"], hits.map(ctx.finding));
  }
  if ("every" in e || "none" in e) {
    const isEvery = "every" in e;
    const { fact, field } = isEvery ? e.every : e.none;
    const bad = asArray(facts.get(fact)).filter((el) => {
      const vs = pluck(el, splitPath(field));
      return isEvery ? !(vs.length > 0 && vs.every(isTruthy)) : vs.some(isTruthy);
    });
    return bad.length === 0 ? step("pass", 1) : step("fail", 0, [isEvery ? "not_every" : "some_present"], bad.map(ctx.finding));
  }

  // any: 가장 좋은 결과 (pass > partial > unknown > fail)
  const subs = e.any.map((x) => evalEvidence(ctx, x)).filter((x): x is Step => x !== "skip");
  if (subs.length === 0) return "skip";
  const rank = (r: Step) => (r.outcome === "pass" ? 3 : r.outcome === "partial" ? 2 + r.score : r.outcome === "unknown" ? 1 : 0);
  const best = subs.reduce((a, b) => (rank(b) > rank(a) ? b : a));
  const pages = subs.flatMap((s) => s.pages);
  return best.outcome === "fail"
    ? step("fail", 0, subs.flatMap((s) => s.reasons), subs.flatMap((s) => s.findings), pages)
    : { ...best, pages };
}

// 증거 결합 (evidence-dsl.md 3.2). 남은 증거가 없으면 pass.
function combine(list: Step[]): Step {
  if (list.length === 0) return step("pass", 1);
  const pages = list.flatMap((r) => r.pages);
  const reasons = list.flatMap((r) => r.reasons);
  const findings = list.flatMap((r) => r.findings);
  if (list.some((r) => r.outcome === "fail")) return step("fail", 0, reasons, findings, pages);
  if (list.some((r) => r.outcome === "unknown")) return step("unknown", 0, reasons, findings, pages);
  const score = Math.min(...list.map((r) => r.score));
  return step(score === 1 ? "pass" : "partial", score, reasons, findings, pages);
}

// parent_hint 자리표시자 경로 (evidence-dsl.md 3.4)
//   fields[kind=other]   배열 원소 거르기 (=, !=)
//   label(name)          마지막 칸: "label(name)" 형식, 한쪽만 있으면 그 값
function walkHint(v: unknown, segs: string[]): string[] {
  if (Array.isArray(v)) return v.flatMap((x) => walkHint(x, segs));
  if (segs.length === 0) return typeof v === "string" ? [v] : [];
  if (v === null || typeof v !== "object") return [];
  const obj = v as Record<string, unknown>;
  const [seg, ...rest] = segs as [string, ...string[]];
  const combo = rest.length === 0 ? seg.match(/^(\w+)\((\w+)\)$/) : null;
  if (combo) {
    const [a, b] = [obj[combo[1]!], obj[combo[2]!]].map((x) => (typeof x === "string" && x !== "" ? x : undefined));
    return a && b && a !== b ? [`${a}(${b})`] : a || b ? [(a ?? b)!] : [];
  }
  const filter = seg.match(/^(\w+)\[(\w+)(!?=)([^\]]*)\]$/);
  if (filter) {
    const [, field, key, op, value] = filter;
    const items = asArray(obj[field!]).filter((it) => (String((it as Record<string, unknown>)?.[key!]) === value) === (op === "="));
    return items.flatMap((x) => walkHint(x, rest));
  }
  return walkHint(obj[seg], rest);
}

// {fact.path}를 Fact 값으로 채운다. 표시 이름(labels.yaml)이 있으면 바꾸고, 중복을 빼고 ", "로 잇는다.
// 채울 값이 하나라도 비면 undefined (그 줄은 policyTodo에 넣지 않는다).
export function renderHint(hint: string, facts: FactMap, labels: Labels = {}): string | undefined {
  let out = hint;
  for (const ph of hintPlaceholders(hint)) {
    const [key, ...path] = ph.split(".");
    const names = labels[ph.replace(/\[[^\]]*\]/g, "")] ?? {};
    const values = [...new Set(walkHint(facts.get(key!), path).map((v) => names[v] ?? v))];
    if (values.length === 0) return undefined;
    out = out.replace(`{${ph}}`, values.join(", "));
  }
  return out;
}

function traceFound(o: Obligation, facts: FactMap): boolean {
  const texts = strings(pluck(facts.get("all_text"), ["text"])).map(normalize);
  return (o.trace ?? []).some((item) => texts.some((t) => matchItem(t, item)));
}

// 없어서 문제일 때 찾아본 범위 (report-schema.md 5장)
function searchedScope(facts: FactMap): NonNullable<Finding["searched"]> {
  const pages = asArray(facts.get("pages")) as PageRoute[];
  const footer = [...new Set(strings(pluck(facts.get("footer_links"), ["file"])))];
  return { routes: pages.filter((p) => p.source !== "footer-link").length, footer, texts: asArray(facts.get("all_text")).length };
}

export function evaluate(o: Obligation, facts: FactMap, mode: "static" | "live", labels: Labels = {}): EvalOutput {
  const rendered = hintLines(o).flatMap((line) => renderHint(line, facts, labels) ?? []);
  const hint = rendered.length > 0 ? { hints: rendered } : {};
  if (o.trigger !== undefined && !evalCondition(o.trigger, facts)) {
    return { id: o.id, applicable: false, outcome: "pass", score: 1, certain: false, reasons: [], findings: [], ...hint };
  }

  const finding = (el?: unknown): Finding => {
    const location = locOf(el);
    return { ...(location ? { location } : {}), message: o.message ?? o.id, fix: o.fix ?? "" };
  };
  const steps = o.evidence.map((e) => evalEvidence({ o, facts, mode, finding }, e)).filter((x): x is Step => x !== "skip");
  const r = combine(steps);

  // 확실성 (evidence-dsl.md 3.3): 흔적이 없고 맞는 페이지도 없을 때만 확실한 실패
  const certain = r.outcome === "pass" ? false : o.trace ? !traceFound(o, facts) && r.pages.length === 0 : r.outcome === "fail";
  // 걸린 원소가 없는 실패 = 없어서 문제 → 찾아본 범위를 붙인다
  const findings = r.outcome === "pass" ? [] : r.findings.length > 0 ? r.findings : [{ ...finding(), searched: searchedScope(facts) }];
  const config = r.outcome === "pass" ? r.pages.find((p) => p.source === "config") : undefined;

  return {
    id: o.id,
    applicable: true,
    outcome: r.outcome,
    score: r.score,
    certain,
    reasons: r.reasons,
    findings,
    ...(config ? { configPage: { url: config.external ?? config.path, verified: false } } : {}),
    ...hint,
  };
}
