import type { SourceFile } from "../types.js";
import { globToRegExp } from "./files.js";

// git이 없을 때 쓰는 .gitignore 해석 (fallback). 스캔 루트 안의 .gitignore만 본다.
// ponytail: 자주 쓰는 문법(*, **, !, 끝 /, 앞 /)만 지원. 문자 클래스 [abc]·이스케이프는 그대로 비교한다.

interface Rule {
  base: string; // .gitignore가 있는 폴더 ("" = 루트)
  re: RegExp;
  negate: boolean;
  dirOnly: boolean;
}

function parse(base: string, text: string): Rule[] {
  return text.split(/\r?\n/).flatMap((raw) => {
    let line = raw.trimEnd();
    if (!line || line.startsWith("#")) return [];
    const negate = line.startsWith("!");
    if (negate) line = line.slice(1);
    const dirOnly = line.endsWith("/");
    if (dirOnly) line = line.slice(0, -1);
    // 가운데나 앞에 /가 있으면 .gitignore 위치 기준, 없으면 어느 깊이의 이름이든
    const anchored = line.includes("/");
    if (line.startsWith("/")) line = line.slice(1);
    const re = globToRegExp(anchored ? line : `**/${line}`);
    return [{ base, re, negate, dirOnly }];
  });
}

// path(파일)가 무시되는지: 파일 자신이나 상위 폴더가 규칙에 맞으면 무시. 마지막에 맞은 규칙이 이긴다.
export function gitignoreMatcher(files: SourceFile[]): (path: string) => boolean {
  const rules = files
    .filter((f) => f.path === ".gitignore" || f.path.endsWith("/.gitignore"))
    .sort((a, b) => a.path.split("/").length - b.path.split("/").length)
    .flatMap((f) => parse(f.path.slice(0, -".gitignore".length).replace(/\/$/, ""), f.content ?? ""));

  return (path) => {
    const parts = path.split("/");
    let ignored = false;
    for (const r of rules) {
      if (r.base && !path.startsWith(`${r.base}/`)) continue;
      const rel = r.base ? path.slice(r.base.length + 1).split("/") : parts;
      // 상위 폴더들(폴더 규칙 포함)과 파일 자신
      for (let i = 1; i <= rel.length; i++) {
        const isFile = i === rel.length;
        if (isFile && r.dirOnly) continue;
        if (r.re.test(rel.slice(0, i).join("/"))) ignored = !r.negate;
      }
    }
    return ignored;
  };
}
