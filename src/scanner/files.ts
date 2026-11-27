import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import type { SourceFile } from "../types.js";

// facts.md 2장 공통 제외
const EXCLUDED_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage"]);

const TEXT_EXTS = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue", ".svelte",
  ".html", ".htm", ".css", ".json", ".md", ".mdx", ".yaml", ".yml", ".toml", ".sql", ".rules", ".txt",
]);

const MAX_TEXT_BYTES = 1024 * 1024;

const isText = (name: string) => TEXT_EXTS.has(extname(name).toLowerCase()) || name.startsWith(".env") || name === ".gitignore";

// `**` 는 여러 폴더, `*` 는 폴더 하나 안, `?` 는 한 글자
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      re += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

// 심볼릭 링크는 따라가지 않는다 (Dirent는 링크 자체의 종류를 알려 준다).
export function collectFiles(root: string, ignorePaths: string[] = []): SourceFile[] {
  const ignore = ignorePaths.map(globToRegExp);
  const out: SourceFile[] = [];
  const walk = (rel: string) => {
    for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
      const path = rel ? `${rel}/${e.name}` : e.name;
      if (ignore.some((r) => r.test(path))) continue;
      if (e.isDirectory()) {
        if (!EXCLUDED_DIRS.has(e.name)) walk(path);
      } else if (e.isFile()) {
        const abs = join(root, path);
        const readable = isText(e.name) && statSync(abs).size <= MAX_TEXT_BYTES;
        out.push(readable ? { path, content: readFileSync(abs, "utf8") } : { path });
      }
    }
  };
  walk("");
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
