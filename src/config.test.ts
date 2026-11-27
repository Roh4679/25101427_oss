import { describe, expect, it } from "vitest";
import { parseConfig, UserError } from "./config.js";

describe("parseConfig", () => {
  it("명세 예시를 통과시킨다", () => {
    const c = parseConfig({
      region: "kr",
      weightMode: "grade",
      factors: { "ux/button-labels": { L: 1, I: 1, P: 2 } },
      disable: ["advertising/unsupported-claims"],
      pages: { privacyPolicy: "https://example.notion.site/privacy", terms: "/terms" },
      confirmations: { "privacy/minimal-collection": "pass" },
      ignorePaths: ["legacy/**"],
    });
    expect(c.pages?.terms).toBe("/terms");
  });

  it("모르는 키는 오류", () => {
    expect(() => parseConfig({ unknownKey: 1 })).toThrow(UserError);
  });

  it("pages의 모르는 종류는 오류", () => {
    expect(() => parseConfig({ pages: { about: "/about" } })).toThrow(UserError);
  });

  it("L·I·P는 1~3 정수만", () => {
    expect(() => parseConfig({ factors: { a: { L: 4, I: 1, P: 1 } } })).toThrow(UserError);
  });

  it("confirmations 값은 pass·fail만", () => {
    expect(() => parseConfig({ confirmations: { a: "ok" } })).toThrow(UserError);
  });
});
