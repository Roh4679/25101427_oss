import { describe, expect, it } from "vitest";
import { KnowledgeError, parseKnowledge } from "./loader.js";
import { parseServices } from "./services.js";
import { testKb } from "./test-kb.js";

const parse = (yaml: string) => parseKnowledge([["x.yaml", yaml]]);
const errorOf = (yaml: string) => {
  try {
    parse(yaml);
  } catch (e) {
    expect(e).toBeInstanceOf(KnowledgeError);
    return (e as Error).message;
  }
  throw new Error("오류가 나야 합니다");
};

const ob = (extra: string, id = "ux/sample", factors = "{ L: 1, I: 1, P: 1 }") => `
- id: ${id}
  category: ux
  check: auto
  factors: ${factors}
  message: 테스트 메시지
  fix: 테스트 해결
${extra}`;

describe("parseKnowledge", () => {
  it("명세 예시(테스트 지식 베이스)를 읽는다", () => {
    expect(testKb().map((o) => o.id)).toContain("commerce/refund-policy");
  });

  it("빈 파일은 빈 목록", () => {
    expect(parse("")).toEqual([]);
  });

  it("YAML 문법 오류", () => {
    expect(errorOf("- id: [")).toMatch(/YAML을 읽을 수 없습니다/);
  });

  it("모르는 키·잘못된 L·I·P는 스키마 오류", () => {
    expect(errorOf(ob("  evidence: [{ truthy: uses_vercel }]\n  extra: 1"))).toMatch(/x\.yaml/);
    expect(errorOf(ob("  evidence: [{ truthy: uses_vercel }]", "ux/a", "{ L: 4, I: 1, P: 1 }"))).toMatch(/factors/);
  });

  it("증거는 하나의 유형만, mode는 live만", () => {
    expect(() => parse(ob("  evidence: [{ truthy: uses_vercel, falsy: uses_vercel }]"))).toThrow(KnowledgeError);
    expect(() => parse(ob("  evidence: [{ truthy: uses_vercel, mode: static }]"))).toThrow(KnowledgeError);
  });

  it("T24 치명 등급 + page_exists인데 trace 없음", () => {
    const yaml = ob("  evidence: [{ page_exists: { match: [privacy] } }]", "ux/a", "{ L: 3, I: 2, P: 3 }");
    expect(errorOf(yaml)).toMatch(/치명 등급이면서 페이지 증거를 쓰는 의무는 trace가 필요합니다/);
  });

  it("T49c pages로 지정 가능한 의무(kind)에 trace 없음 (등급 무관)", () => {
    expect(errorOf(ob("  evidence: [{ page_exists: { kind: terms, match: [terms] } }]"))).toMatch(/pages로 지정할 수 있는 의무/);
  });

  it("$trace를 쓰는데 trace 없음", () => {
    expect(errorOf(ob("  evidence: [{ text_contains: { fact: footer_text, any_of: $trace } }]"))).toMatch(/\$trace/);
  });

  it("T42 depends_on 대상 없음 / 순환", () => {
    expect(errorOf(ob("  depends_on: ux/none\n  evidence: [{ truthy: uses_vercel }]"))).toMatch(/depends_on 대상이 없습니다/);
    const cycle = ob("  depends_on: ux/b\n  evidence: [{ truthy: uses_vercel }]", "ux/a") + ob("  depends_on: ux/a\n  evidence: [{ truthy: uses_vercel }]", "ux/b");
    expect(errorOf(cycle)).toMatch(/순환/);
  });

  it("T60 parent_hint의 Fact가 facts.md에 없음", () => {
    const yaml = ob("  evidence: [{ truthy: uses_vercel }]", "ux/p") + ob("  depends_on: ux/p\n  parent_hint: '항목: {no_such_fact}'\n  evidence: [{ truthy: uses_vercel }]", "ux/c");
    expect(errorOf(yaml)).toMatch(/\{no_such_fact\}: facts\.md에 없는 Fact/);
  });

  it("parent_hint는 depends_on이 필요", () => {
    expect(errorOf(ob("  parent_hint: '항목'\n  evidence: [{ truthy: uses_vercel }]"))).toMatch(/depends_on과 함께/);
  });

  it("trigger·evidence의 Fact 오타", () => {
    expect(errorOf(ob("  trigger: uses_supabse\n  evidence: [{ truthy: uses_vercel }]"))).toMatch(/facts\.md에 없는 Fact: uses_supabse/);
  });

  it("id 중복, 잘못된 정규식", () => {
    const dup = ob("  evidence: [{ truthy: uses_vercel }]") + ob("  evidence: [{ truthy: uses_vercel }]");
    expect(errorOf(dup)).toMatch(/중복/);
    expect(errorOf(ob("  evidence: [{ text_contains: { fact: footer_text, any_of: [{ regex: '(' }] } }]"))).toMatch(/잘못된 정규식/);
  });

  it("메시지에 금지 표현", () => {
    const yaml = "- id: ux/a\n  category: ux\n  check: auto\n  factors: { L: 1, I: 1, P: 1 }\n  message: 위반입니다\n  fix: 고치세요\n  evidence: [{ truthy: uses_vercel }]";
    expect(errorOf(yaml)).toMatch(/쓰지 않습니다/);
  });

  it("message·fix가 없으면 오류 (evidence-dsl.md 8장)", () => {
    const msg = errorOf("- id: ux/a\n  category: ux\n  check: auto\n  factors: { L: 1, I: 1, P: 1 }\n  evidence: [{ truthy: uses_vercel }]");
    expect(msg).toMatch(/message가 필요합니다/);
    expect(msg).toMatch(/fix가 필요합니다/);
  });
});

describe("principle (evidence-dsl.md 9장)", () => {
  const privacy = (principle: string) =>
    `- id: privacy/a\n  category: privacy\n  check: auto\n  factors: { L: 1, I: 1, P: 1 }\n  message: m\n  fix: f\n${principle}  evidence: [{ truthy: uses_vercel }]`;

  it("privacy·commerce·advertising·accessibility는 principle 필수, security·ux는 선택", () => {
    expect(errorOf(privacy(""))).toMatch(/privacy 영역은 principle/);
    expect(parse(ob("  evidence: [{ truthy: uses_vercel }]"))).toHaveLength(1); // ux
  });

  it("미확인: article TODO + source·verified_at null + references", () => {
    const yaml = privacy(
      "  principle:\n    law: 개인정보 보호법\n    article: TODO-확인필요\n    source: null\n    verified_at: null\n    references:\n      - { candidate: 법 제30조, basis: 2차 자료 }\n",
    );
    expect(parse(yaml)[0]!.principle?.references?.[0]?.candidate).toBe("법 제30조");
  });

  it("article이 TODO인데 verified_at에 날짜 → 오류", () => {
    const yaml = privacy("  principle: { law: 법, article: TODO-확인필요, source: null, verified_at: 2026-11-28 }\n");
    expect(errorOf(yaml)).toMatch(/null이어야 합니다/);
  });

  it("article을 채웠는데 verified_at·source가 null → 오류", () => {
    const yaml = privacy("  principle: { law: 법, article: 제30조, source: null, verified_at: null }\n");
    expect(errorOf(yaml)).toMatch(/source\(law\.go\.kr 주소\)와 verified_at/);
  });

  it("확인됨: article + source + verified_at", () => {
    const yaml = privacy("  principle: { law: 법, article: 제30조, source: 'https://www.law.go.kr/x', verified_at: '2026-11-28' }\n");
    expect(parse(yaml)[0]!.principle?.verified_at).toBe("2026-11-28");
  });
});

describe("parseServices", () => {
  it("이름과 대응 정보", () => {
    expect(parseServices("- name: OpenAI\n  packages: [openai]")).toEqual([{ name: "OpenAI", packages: ["openai"] }]);
  });
  it("T56b 대응 정보가 없거나 이름이 없으면 오류", () => {
    expect(() => parseServices("- name: X")).toThrow(KnowledgeError);
    expect(() => parseServices("- packages: [openai]")).toThrow(KnowledgeError);
  });
});
