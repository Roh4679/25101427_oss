import { describe, expect, it } from "vitest";
import { matchItem, matchPattern, normalize } from "./normalize.js";

describe("normalize (T51~T54)", () => {
  it("공백·NBSP·줄바꿈·대소문자를 없앤다", () => {
    expect(normalize("개인정보  처리\u00a0방침\n")).toBe("개인정보처리방침");
    expect(normalize("Privacy Policy")).toBe("privacypolicy");
  });
  it("T54 가운뎃점 앞뒤 공백", () => {
    expect(matchPattern(normalize("교환 · 반품 안내"), "교환·반품")).toBe(true);
  });
  it("T53 '환불 정책' = '환불정책'", () => {
    expect(matchPattern(normalize("환불 정책"), "환불정책")).toBe(true);
  });
  it("NFD로 쓴 한글도 같다", () => {
    expect(normalize("처리방침".normalize("NFD"))).toBe("처리방침");
  });
});

describe("matchItem", () => {
  it("동의어 중 하나라도 맞으면 참", () => {
    expect(matchItem(normalize("이용 목적"), ["처리목적", "이용목적"])).toBe(true);
  });
  it("정규식은 정규화한 텍스트에 적용", () => {
    expect(matchItem(normalize("사업자 123-45-67890"), { regex: String.raw`\d{3}-\d{2}-\d{5}` })).toBe(true);
  });
  it("exact는 전체 일치", () => {
    expect(matchPattern(normalize(" 클릭 "), "클릭", true)).toBe(true);
    expect(matchPattern(normalize("클릭해서 가입"), "클릭", true)).toBe(false);
    expect(matchPattern("", "", true)).toBe(true);
  });
});
