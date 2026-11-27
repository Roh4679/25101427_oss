import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { secretsDetector } from "../rules/static/secrets.js";
import { collectFiles } from "../scanner/files.js";
import { loadServices } from "../knowledge/services.js";
import { readGit } from "./git.js";

const NAMES = loadServices(join(import.meta.dirname, "../../knowledge/kr/services.yaml")).env_names;

// 실제 git으로 확인한다 (목 금지, docs/scoring.md T76~T79). git이 없으면 이유를 남기고 건너뛴다.
const hasGit = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
if (!hasGit) console.warn("git이 없어 실제 git 테스트(T76~T79)를 건너뜁니다. CI에는 git이 있어야 합니다.");

function repo(files: Record<string, string>, add: string[], forceAdd: string[] = []): string {
  const root = mkdtempSync(join(tmpdir(), "vs-git-"));
  const g = (...args: string[]) => execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], { cwd: root, stdio: "ignore" });
  g("init", "-q");
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(join(root, p, ".."), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  if (add.length > 0) g("add", ...add);
  if (forceAdd.length > 0) g("add", "-f", ...forceAdd);
  g("commit", "-q", "--allow-empty", "-m", "init");
  return root;
}

// 실제 파이프라인과 같은 방식으로 git 정보를 env_files_exposed까지 계산
function exposed(root: string) {
  const files = collectFiles(root);
  const git = readGit(root, files.map((f) => f.path))!;
  const ignored = new Set(git.ignored);
  const facts = secretsDetector({ tracked: git.tracked, ignored: (p) => ignored.has(p) }, NAMES).detect({ root, files, mode: "static" });
  return { git, exposed: facts.find((f) => f.key === "env_files_exposed")!.value };
}

describe.skipIf(!hasGit)("git 어댑터 (실제 git)", () => {
  it("T76 무시 규칙이 있지만 git add -f로 추적된 .env → tracked (차단 대상)", () => {
    const root = repo({ ".gitignore": ".env\n", ".env": "A=1\n", "index.js": "x" }, [".gitignore", "index.js"], [".env"]);
    const { git, exposed: e } = exposed(root);
    expect(git.tracked).toContain(".env");
    expect(git.ignored).toContain(".env");
    expect(e).toEqual([{ reason: "tracked", file: ".env", line: 1 }]);
  });

  it("T77 무시되고 추적되지 않는 .env → 정상", () => {
    const root = repo({ ".gitignore": ".env\n", ".env": "A=1\n", "index.js": "x" }, [".gitignore", "index.js"]);
    const { git, exposed: e } = exposed(root);
    expect(git.tracked).not.toContain(".env");
    expect(git.ignored).toContain(".env");
    expect(e).toEqual([]);
  });

  it("T78 무시 규칙이 없고 추적도 안 된 .env → not_ignored (차단 대상)", () => {
    const root = repo({ ".env": "A=1\n", "index.js": "x" }, ["index.js"]);
    const { git, exposed: e } = exposed(root);
    expect(git.tracked).toEqual(["index.js"]);
    expect(git.ignored).toEqual([]);
    expect(e).toEqual([{ reason: "not_ignored", file: ".env", line: 1 }]);
  });

  it("T79 스캔 루트가 저장소 하위 폴더여도 경로는 스캔 루트 기준", () => {
    const root = repo({ ".gitignore": ".env\n", "apps/web/.env": "A=1\n", "apps/web/index.js": "x" }, [".gitignore", "apps/web/index.js"]);
    const { git, exposed: e } = exposed(join(root, "apps/web"));
    expect(git.tracked).toEqual(["index.js"]);
    expect(git.ignored).toEqual([".env"]);
    expect(e).toEqual([]);
  });

  it("저장소가 아니면 undefined (추적 여부 모름)", () => {
    expect(readGit(mkdtempSync(join(tmpdir(), "vs-nogit-")), ["a"])).toBeUndefined();
  });
});
