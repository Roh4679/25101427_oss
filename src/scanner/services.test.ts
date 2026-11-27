import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadServices, parseServices } from "../knowledge/services.js";
import type { SourceFile } from "../types.js";
import { collectFiles } from "./files.js";
import { servicesDetector } from "./services.js";

const TABLE = parseServices(`
services:
  - name: Supabase
    packages: ["@supabase/*"]
    hosts: ["*.supabase.co"]
    files: ["supabase/**"]
  - name: OpenAI
    packages: ["openai"]
    hosts: ["api.openai.com"]
env_names: { public: [], restricted: [] }
tracking_cookies: []
`).services;

const detect = (files: SourceFile[]) => servicesDetector(TABLE).detect({ root: "/", files, mode: "static" })[0]!.value;
const pkg = (deps: Record<string, string>): SourceFile => ({ path: "package.json", content: JSON.stringify({ dependencies: deps }) });

describe("servicesDetector", () => {
  it("접두어 패키지, 정확한 패키지 → 대응표 순서", () => {
    expect(detect([pkg({ openai: "4", "@supabase/ssr": "0" })])).toEqual(["Supabase", "OpenAI"]);
  });
  it("코드의 호출 호스트 (와일드카드 하위 도메인)", () => {
    expect(detect([{ path: "src/db.ts", content: 'fetch("https://abcd.supabase.co/rest/v1")' }])).toEqual(["Supabase"]);
  });
  it("README의 호스트 언급은 무시", () => {
    expect(detect([{ path: "README.md", content: "api.openai.com" }])).toEqual([]);
  });
  it("파일 패턴", () => {
    expect(detect([{ path: "supabase/migrations/1.sql" }])).toEqual(["Supabase"]);
  });
  it("T56a 대응표에 없는 패키지만 → 빈 배열", () => {
    expect(detect([pkg({ react: "18", "openai-like": "1" })])).toEqual([]);
  });
});

describe("knowledge/kr/services.yaml", () => {
  const table = loadServices(join(import.meta.dirname, "../../knowledge/kr/services.yaml")).services;
  const fixture = (name: string) => {
    const root = join(import.meta.dirname, "../../fixtures/intentional", name);
    return servicesDetector(table).detect({ root, files: collectFiles(root), mode: "static" })[0]!.value;
  };

  it("스키마를 통과하고, 국가를 적지 않는다", () => {
    expect(table.length).toBeGreaterThan(0);
  });
  it.each([
    ["clean-app", ["Supabase"]],
    ["leaky-keys-app", ["OpenAI"]],
    ["signup-app", []],
    ["consent-label-app", []],
  ])("%s → %j", (name, expected) => {
    expect(fixture(name)).toEqual(expected);
  });
});
