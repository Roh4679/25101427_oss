import { execFileSync } from "node:child_process";

// git 추적·무시 정보 (docs/spec/facts.md 6장). 외부 프로그램은 adapters에서만 실행한다.
// 셸을 거치지 않고(execFileSync) 고정된 인자만 넘긴다. 사용자 프로젝트의 스크립트는 실행하지 않는다.

export interface GitInfo {
  tracked: string[]; // 스캔 루트 기준 경로
  ignored: string[];
}

function git(root: string, args: string[], input?: string): string {
  return execFileSync("git", args, { cwd: root, input, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
}

// git이 없거나 저장소가 아니면 undefined (추적 여부 모름 → 호출하는 쪽이 .gitignore를 직접 해석)
export function readGit(root: string, paths: string[]): GitInfo | undefined {
  try {
    if (git(root, ["rev-parse", "--is-inside-work-tree"]).trim() !== "true") return undefined;
    // -z: 경로를 NUL로 구분 (한글·공백 경로 그대로). ls-files는 cwd(스캔 루트) 기준 경로를 낸다.
    const tracked = git(root, ["-c", "core.quotepath=false", "ls-files", "-z"]).split("\0").filter(Boolean);
    let ignored: string[] = [];
    if (paths.length > 0) {
      try {
        // --no-index: 추적 중인 파일도 무시 규칙에 걸리는지 본다 (git add -f 한 .env)
        ignored = git(root, ["check-ignore", "--no-index", "-z", "--stdin"], paths.join("\0") + "\0").split("\0").filter(Boolean);
      } catch (e) {
        // 종료 코드 1 = 무시되는 경로 없음
        if ((e as { status?: number }).status !== 1) throw e;
      }
    }
    return { tracked, ignored };
  } catch {
    return undefined;
  }
}
