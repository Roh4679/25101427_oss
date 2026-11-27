import { describe, expect, it } from "vitest";
import type { SourceFile } from "../types.js";
import { detectFramework, projectDetector } from "./project.js";

const facts = (files: SourceFile[]) =>
  Object.fromEntries(projectDetector.detect({ root: "/", files, mode: "static" }).map((f) => [f.key, f.value]));

const pkg = (deps: Record<string, string>, dev: Record<string, string> = {}): SourceFile => ({
  path: "package.json",
  content: JSON.stringify({ name: "x", dependencies: deps, devDependencies: dev }),
});

describe("detectFramework", () => {
  it("next + app/**/page.tsx → next-app (route group 포함)", () => {
    expect(detectFramework([{ path: "app/(legal)/privacy/page.tsx" }], ["next"])).toBe("next-app");
  });
  it("next + pages/ → next-pages", () => {
    expect(detectFramework([{ path: "pages/index.tsx" }], ["next"])).toBe("next-pages");
  });
  it("app과 pages가 모두 있으면 next-app 우선", () => {
    expect(detectFramework([{ path: "pages/a.tsx" }, { path: "src/app/page.tsx" }], ["next"])).toBe("next-app");
  });
  it("next가 없으면 pages/ 폴더만으로 next-pages가 아니다", () => {
    expect(detectFramework([{ path: "pages/index.tsx" }], [])).toBe("unknown");
  });
  it("react-router-dom → react-router", () => {
    expect(detectFramework([{ path: "index.html" }], ["react-router-dom"])).toBe("react-router");
  });
  it("루트·public의 html → static-html, 하위 폴더 html은 아님", () => {
    expect(detectFramework([{ path: "public/index.html" }], [])).toBe("static-html");
    expect(detectFramework([{ path: "docs/a.html" }], [])).toBe("unknown");
  });
});

describe("projectDetector", () => {
  it("의존성으로 uses_* 감지", () => {
    const f = facts([pkg({ "@supabase/supabase-js": "2", openai: "4" }, { "@vercel/analytics": "1" })]);
    expect(f).toMatchObject({ uses_supabase: true, uses_openai: true, uses_vercel: true, uses_firebase: false, uses_anthropic: false });
    expect(f.dependencies).toEqual(["@supabase/supabase-js", "openai", "@vercel/analytics"]);
  });

  it("파일로 uses_* 감지", () => {
    const f = facts([{ path: "supabase/migrations/1.sql" }, { path: "firebase.json" }, { path: "vercel.json" }]);
    expect(f).toMatchObject({ uses_supabase: true, uses_firebase: true, uses_vercel: true });
  });

  it("코드의 호출 호스트로 감지하되 README 언급은 무시", () => {
    expect(facts([{ path: "src/ai.ts", content: 'fetch("https://api.anthropic.com/v1/messages")' }]).uses_anthropic).toBe(true);
    expect(facts([{ path: "README.md", content: "api.openai.com" }]).uses_openai).toBe(false);
  });

  it("깨진 package.json은 의존성 없음으로 본다", () => {
    const f = facts([{ path: "package.json", content: "{ not json" }]);
    expect(f.dependencies).toEqual([]);
    expect(f.framework).toBe("unknown");
  });

  it("scan_mode를 그대로 낸다", () => {
    expect(facts([]).scan_mode).toBe("static");
  });
});
