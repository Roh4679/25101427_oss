import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { z } from "zod";

// fixture 준비 (fixtures/README.md "fixture 준비"): 골든 테스트와 데모가 함께 쓴다.
// 임시 폴더에 복사 → fixture.setup.json의 파일(.env 등) 생성 → git init → .gitignore를 지켜 add·commit.
// 그래서 .env 같은 파일은 저장소에 두지 않고, 판정은 실제 git 상태로 한다.

const setupSchema = z.object({ files: z.record(z.string(), z.string()) }).strict();

// fixture 앱이 아닌 파일 (정답지·준비 파일)
const NOT_APP = new Set(["fixture.setup.json", "expected.json", "expected.draft.json"]);

export function prepareFixture(dir: string): string {
  const root = join(mkdtempSync(join(tmpdir(), "vs-fixture-")), basename(dir));
  cpSync(dir, root, { recursive: true, filter: (src) => !NOT_APP.has(basename(src)) });

  const setupFile = join(dir, "fixture.setup.json");
  if (existsSync(setupFile)) {
    const setup = setupSchema.parse(JSON.parse(readFileSync(setupFile, "utf8")));
    for (const [path, content] of Object.entries(setup.files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
  }

  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=fixture", "-c", "user.email=fixture@example.com", "-c", "core.autocrlf=false", ...args], {
      cwd: root,
      stdio: "ignore",
    });
  git("init", "-q");
  git("add", "-A"); // .gitignore가 무시하는 파일은 추가되지 않는다
  git("commit", "-q", "--allow-empty", "-m", "fixture");
  return root;
}
