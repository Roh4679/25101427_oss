import type { PageRoute, SourceFile } from "../../types.js";

// 파일 경로 → 페이지 주소 (docs/spec/facts.md 2장 해석 규칙)

const NEXT_APP = /^(?:src\/)?app\/(?:(.*)\/)?page\.(?:tsx|jsx|ts|js)$/;
const NEXT_PAGES = /^(?:src\/)?pages\/(.+)\.(?:tsx|jsx|ts|js)$/;
const STATIC_HTML = /^(?:public\/)?([^/]+)\.html$/;

const route = (path: string, file: string): PageRoute => ({ path, file, source: "file-route" });

// app/(legal)/privacy/page.tsx → /privacy. (group)은 주소에서 빼고, _폴더·@슬롯은 제외.
export function nextAppRoute(file: string): PageRoute | undefined {
  const m = file.match(NEXT_APP);
  if (!m) return undefined;
  const segs = (m[1] ?? "").split("/").filter(Boolean);
  if (segs.some((s) => s.startsWith("_") || s.startsWith("@"))) return undefined;
  return route(`/${segs.filter((s) => !/^\(.*\)$/.test(s)).join("/")}`, file);
}

// pages/terms.tsx → /terms, pages/blog/index.tsx → /blog. _app, _document, api/ 제외.
export function nextPagesRoute(file: string): PageRoute | undefined {
  const m = file.match(NEXT_PAGES);
  if (!m) return undefined;
  const segs = m[1]!.split("/");
  if (segs[0] === "api" || segs.some((s) => s.startsWith("_"))) return undefined;
  if (segs.at(-1) === "index") segs.pop();
  return route(`/${segs.join("/")}`, file);
}

// index.html → /, terms.html → /terms.html (루트와 public/)
export function staticHtmlRoute(file: string): PageRoute | undefined {
  const m = file.match(STATIC_HTML);
  if (!m) return undefined;
  return route(m[1] === "index" ? "/" : `/${m[1]}.html`, file);
}

export function fileRoutes(files: SourceFile[], deps: string[]): PageRoute[] {
  const next = deps.includes("next");
  const resolvers = [...(next ? [nextAppRoute, nextPagesRoute] : []), staticHtmlRoute];
  return files.flatMap((f) => resolvers.map((r) => r(f.path)).filter((r): r is PageRoute => r !== undefined));
}
