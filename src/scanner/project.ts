import { z } from "zod";
import type { Detector, Fact, ScanContext, SourceFile } from "../types.js";

// 사용자 프로젝트의 package.json. 필요한 필드만 검증하고 나머지는 둔다.
const packageJsonSchema = z.looseObject({
  name: z.string().optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
});

export type PackageJson = z.infer<typeof packageJsonSchema>;

// 깨진 package.json은 없는 것으로 본다 (사용자 프로젝트 문제이지 실행 오류가 아니다).
export function readPackageJson(files: SourceFile[]): PackageJson | undefined {
  const content = files.find((f) => f.path === "package.json")?.content;
  if (content === undefined) return undefined;
  try {
    const parsed = packageJsonSchema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

const CODE_FILE = /\.(js|jsx|ts|tsx|mjs|cjs|vue|svelte|html?)$/;
const NEXT_APP_PAGE = /^(src\/)?app\/(.*\/)?page\.(tsx|jsx|ts|js)$/;
const NEXT_PAGES = /^(src\/)?pages\/.+\.(tsx|jsx|ts|js)$/;
const STATIC_HTML = /^(public\/)?[^/]+\.html$/;

type Framework = "next-app" | "next-pages" | "react-router" | "static-html" | "unknown";

export function detectFramework(files: SourceFile[], deps: string[]): Framework {
  const has = (re: RegExp) => files.some((f) => re.test(f.path));
  const next = deps.includes("next");
  if (next && has(NEXT_APP_PAGE)) return "next-app";
  if (next && has(NEXT_PAGES)) return "next-pages";
  if (deps.includes("react-router") || deps.includes("react-router-dom")) return "react-router";
  if (has(STATIC_HTML)) return "static-html";
  return "unknown";
}

const codeMentions = (files: SourceFile[], host: string) =>
  files.some((f) => CODE_FILE.test(f.path) && f.content?.includes(host) === true);

// facts.md 1장: scan_mode, framework, dependencies, uses_*
export const projectDetector: Detector = {
  id: "project",
  detect(ctx: ScanContext): Fact[] {
    const pkg = readPackageJson(ctx.files);
    const deps = [...Object.keys(pkg?.dependencies ?? {}), ...Object.keys(pkg?.devDependencies ?? {})];
    const hasDep = (name: string) => deps.includes(name);
    const hasDepPrefix = (prefix: string) => deps.some((d) => d.startsWith(prefix));
    const hasPath = (test: (p: string) => boolean) => ctx.files.some((f) => test(f.path));

    const facts: Record<string, unknown> = {
      scan_mode: ctx.mode,
      framework: detectFramework(ctx.files, deps),
      dependencies: deps,
      uses_supabase: hasDepPrefix("@supabase/") || hasPath((p) => p.startsWith("supabase/")),
      uses_firebase: hasDep("firebase") || hasDep("firebase-admin") || hasPath((p) => p === "firebase.json"),
      uses_openai: hasDep("openai") || codeMentions(ctx.files, "api.openai.com"),
      uses_anthropic: hasDep("@anthropic-ai/sdk") || codeMentions(ctx.files, "api.anthropic.com"),
      uses_vercel: hasDepPrefix("@vercel/") || hasPath((p) => p === "vercel.json"),
    };
    return Object.entries(facts).map(([key, value]) => ({ key, value }));
  },
};
