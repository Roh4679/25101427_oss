import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectFiles } from "./files.js";
import { projectDetector } from "./project.js";

// 의도적 fixture의 프로젝트 유형 감지 (코드는 읽기만 한다)
const facts = (name: string) => {
  const root = join(import.meta.dirname, "../../fixtures/intentional", name);
  const files = collectFiles(root);
  return Object.fromEntries(projectDetector.detect({ root, files, mode: "static" }).map((f) => [f.key, f.value]));
};

describe("fixture 프로젝트 감지", () => {
  it.each([
    ["clean-app", "next-app", { uses_supabase: true, uses_openai: false }],
    ["signup-app", "next-pages", { uses_supabase: false }],
    ["consent-label-app", "next-app", { uses_supabase: false }],
    ["leaky-keys-app", "static-html", { uses_openai: true }],
  ])("%s → %s", (name, framework, extra) => {
    expect(facts(name)).toMatchObject({ framework, ...extra });
  });
});
