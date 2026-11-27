import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectFiles, globToRegExp } from "./files.js";

describe("globToRegExp", () => {
  it.each([
    ["legacy/**", "legacy/a/b.ts", true],
    ["legacy/**", "src/legacy/a.ts", false],
    ["**/*.test.ts", "a.test.ts", true],
    ["**/*.test.ts", "src/x/a.test.ts", true],
    ["src/*.ts", "src/x/a.ts", false],
    ["a?.js", "ab.js", true],
  ])("%s ~ %s → %s", (glob, path, ok) => {
    expect(globToRegExp(glob).test(path)).toBe(ok);
  });
});

describe("collectFiles", () => {
  it("공통 제외 폴더와 ignorePaths를 빼고, 텍스트 파일만 읽는다", () => {
    const root = mkdtempSync(join(tmpdir(), "vs-files-"));
    const put = (p: string, c: string) => {
      mkdirSync(join(root, p, ".."), { recursive: true });
      writeFileSync(join(root, p), c);
    };
    put("app/page.tsx", "x");
    put("node_modules/a/index.js", "x");
    put(".next/a.js", "x");
    put("legacy/old.js", "x");
    put(".env", "A=1");
    put("logo.png", "binary");

    const files = collectFiles(root, ["legacy/**"]);
    expect(files.map((f) => f.path)).toEqual([".env", "app/page.tsx", "logo.png"]);
    expect(files.find((f) => f.path === "logo.png")?.content).toBeUndefined();
    expect(files.find((f) => f.path === ".env")?.content).toBe("A=1");
  });
});
