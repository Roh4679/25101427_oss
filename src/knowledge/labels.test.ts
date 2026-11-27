import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderHint } from "./evaluate.js";
import { loadLabels, parseLabels } from "./labels.js";
import { KnowledgeError } from "./loader.js";

describe("labels.yaml", () => {
  const labels = loadLabels(join(import.meta.dirname, "../../knowledge/kr/labels.yaml"));

  it("폼 필드·분석 도구 표시 이름", () => {
    expect(labels["personal_forms.fields.kind"]).toMatchObject({ email: "이메일", birth: "생년월일", address: "주소" });
    expect(labels["analytics_scripts.vendor"]?.ga4).toBe("Google Analytics 4");
  });

  it("parent_hint에 표시 이름을 쓰고, 표에 없는 값은 그대로", () => {
    const facts = new Map<string, unknown>([["personal_forms", [{ fields: [{ kind: "email" }, { kind: "birth" }, { kind: "nickname" }] }]]]);
    expect(renderHint("수집 항목: {personal_forms.fields.kind}", facts, labels)).toBe("수집 항목: 이메일, 생년월일, nickname");
  });

  it("facts.md에 없는 Fact 경로는 오류", () => {
    expect(() => parseLabels("no_such_fact.x:\n  a: b")).toThrow(KnowledgeError);
  });
});
