// 텍스트 정규화와 패턴 비교 (docs/spec/evidence-dsl.md 1장, 3.1)

export type Pattern = string | { regex: string };
export type PatternItem = Pattern | Pattern[]; // 배열 = 동의어

// NFC → 소문자 → 모든 공백 제거 ("국외 이전" = "국외이전", NBSP 포함)
export function normalize(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/\s+/gu, "");
}

const synonyms = (item: PatternItem): Pattern[] => (Array.isArray(item) ? item : [item]);

// 정규식은 정규화한 텍스트에 적용한다. exact면 전체 일치.
export function matchPattern(normText: string, p: Pattern, exact = false): boolean {
  if (typeof p === "string") return exact ? normText === normalize(p) : normText.includes(normalize(p));
  return new RegExp(exact ? `^(?:${p.regex})$` : p.regex, "u").test(normText);
}

export const matchItem = (normText: string, item: PatternItem, exact = false): boolean =>
  synonyms(item).some((p) => matchPattern(normText, p, exact));

export const regexesOf = (items: PatternItem[]): string[] =>
  items.flatMap(synonyms).flatMap((p) => (typeof p === "string" ? [] : [p.regex]));
