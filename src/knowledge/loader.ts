import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";
import { UserError } from "../config.js";
import { FACT_KEYS } from "../facts.js";
import { gradeOf } from "../score/index.js";
import { regexesOf, type PatternItem } from "./normalize.js";
import { knowledgeFileSchema, type Condition, type Evidence, type Obligation } from "./schema.js";

export class KnowledgeError extends UserError {}

// 서비스 대응표처럼 의무 목록이 아닌 데이터 파일
const DATA_FILES = new Set(["services.yaml", "labels.yaml"]);
const FORBIDDEN_WORDS = /위법|불법|위반입니다/;

export const isLiveOnly = (o: Obligation) => o.evidence.every((e) => e.mode === "live");

export function evidenceList(list: Evidence[]): Evidence[] {
  return list.flatMap((e) => ("any" in e ? [e, ...evidenceList(e.any)] : [e]));
}

function conditionFacts(c: Condition): string[] {
  if (typeof c === "string") return [c];
  if ("all" in c) return c.all.flatMap(conditionFacts);
  if ("any" in c) return c.any.flatMap(conditionFacts);
  if ("not" in c) return conditionFacts(c.not);
  return [c.fact];
}

function evidenceFacts(e: Evidence): string[] {
  if ("page_exists" in e || "page_text_contains" in e) return ["pages"];
  if ("truthy" in e) return [e.truthy];
  if ("falsy" in e) return [e.falsy];
  if ("coverage" in e) return [e.coverage];
  if ("text_contains" in e) return [e.text_contains.fact];
  if ("text_absent" in e) return [e.text_absent.fact];
  if ("every" in e) return [e.every.fact];
  if ("none" in e) return [e.none.fact];
  return [];
}

// 증거의 any_of·all_of 목록 (없으면 undefined)
export function textList(e: Evidence): "$trace" | PatternItem[] | undefined {
  const body = "page_text_contains" in e ? e.page_text_contains : "text_contains" in e ? e.text_contains : "text_absent" in e ? e.text_absent : undefined;
  if (!body) return undefined;
  return "any_of" in body && body.any_of !== undefined ? body.any_of : "all_of" in body ? body.all_of : undefined;
}

const evidencePatterns = (e: Evidence): PatternItem[] => {
  const list = textList(e);
  return Array.isArray(list) ? list : [];
};

export const hintPlaceholders = (hint: string) => [...hint.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!);

// 항목 하나만 보고 알 수 있는 오류
function checkObligation(o: Obligation): string[] {
  const errors: string[] = [];
  const evs = evidenceList(o.evidence);
  const usesPage = evs.some((e) => "page_exists" in e || "page_text_contains" in e);
  const pageable = evs.some((e) => "page_exists" in e && e.page_exists.kind !== undefined);
  const usesTrace = evs.some((e) => textList(e) === "$trace");

  if (!o.trace && gradeOf(o.factors.L * o.factors.I * o.factors.P) === "critical" && usesPage)
    errors.push("치명 등급이면서 페이지 증거를 쓰는 의무는 trace가 필요합니다");
  if (!o.trace && pageable) errors.push("pages로 지정할 수 있는 의무(page_exists에 kind)는 trace가 필요합니다");
  if (!o.trace && usesTrace) errors.push("$trace를 쓰려면 trace가 필요합니다");

  const facts = [...(o.trigger ? conditionFacts(o.trigger) : []), ...evs.flatMap(evidenceFacts)];
  for (const key of facts) if (!FACT_KEYS.has(key)) errors.push(`facts.md에 없는 Fact: ${key}`);

  if (o.parent_hint) {
    if (!o.depends_on) errors.push("parent_hint는 depends_on과 함께 써야 합니다");
    for (const ph of hintPlaceholders(o.parent_hint)) {
      const key = ph.split(".")[0]!;
      if (!FACT_KEYS.has(key)) errors.push(`parent_hint의 {${ph}}: facts.md에 없는 Fact`);
    }
  }

  for (const re of regexesOf([...(o.trace ?? []), ...evs.flatMap(evidencePatterns)])) {
    try {
      new RegExp(re, "u");
    } catch {
      errors.push(`잘못된 정규식: ${re}`);
    }
  }

  // 모든 증거 유형이 실패할 수 있으므로 모든 의무에 필요하다 (evidence-dsl.md 8장)
  if (!o.message) errors.push("message가 필요합니다 (실패·확인 필요일 때 보여 줄 설명)");
  if (!o.fix) errors.push("fix가 필요합니다 (해결 방법)");

  for (const text of [o.message, o.fix, o.parent_hint]) {
    if (text && FORBIDDEN_WORDS.test(text)) errors.push(`메시지에 "위법·불법·위반입니다"를 쓰지 않습니다: ${text}`);
  }
  return errors.map((e) => `${o.id}: ${e}`);
}

// 항목 사이의 오류: 중복 id, depends_on 대상 없음·순환
function checkGraph(list: Obligation[]): string[] {
  const errors: string[] = [];
  const byId = new Map<string, Obligation>();
  for (const o of list) {
    if (byId.has(o.id)) errors.push(`${o.id}: id가 중복됩니다`);
    byId.set(o.id, o);
  }
  for (const o of list) {
    if (!o.depends_on) continue;
    if (!byId.has(o.depends_on)) {
      errors.push(`${o.id}: depends_on 대상이 없습니다 (${o.depends_on})`);
      continue;
    }
    const seen = new Set([o.id]);
    for (let cur = byId.get(o.depends_on); cur; cur = cur.depends_on ? byId.get(cur.depends_on) : undefined) {
      if (seen.has(cur.id)) {
        errors.push(`${o.id}: depends_on이 순환합니다`);
        break;
      }
      seen.add(cur.id);
    }
  }
  return errors;
}

// files: [파일 이름, YAML 내용]. 파일 이름순, 파일 안 순서가 지식 베이스 순서다.
export function parseKnowledge(files: [string, string][]): Obligation[] {
  const list: Obligation[] = [];
  const errors: string[] = [];
  for (const [name, text] of files) {
    let raw: unknown;
    try {
      raw = text.trim() === "" ? [] : load(text);
    } catch (e) {
      errors.push(`${name}: YAML을 읽을 수 없습니다 (${(e as Error).message.split("\n")[0]})`);
      continue;
    }
    const parsed = knowledgeFileSchema.safeParse(raw);
    if (!parsed.success) {
      for (const i of parsed.error.issues) errors.push(`${name}: ${i.path.join(".") || "(최상위)"}: ${i.message}`);
      continue;
    }
    list.push(...parsed.data);
  }
  errors.push(...list.flatMap(checkObligation), ...checkGraph(list));
  if (errors.length > 0) throw new KnowledgeError(`지식 베이스 형식을 확인해 주세요\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  return list;
}

export function loadKnowledge(dir: string): Obligation[] {
  const names = readdirSync(dir)
    .filter((n) => n.endsWith(".yaml") && !DATA_FILES.has(n))
    .sort();
  return parseKnowledge(names.map((n) => [n, readFileSync(join(dir, n), "utf8")]));
}
