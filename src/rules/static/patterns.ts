import { isCodeFile, lex, lineIndex } from "../../scanner/source.js";
import type { Detector } from "../../types.js";

// 위험한 코드 패턴 (docs/spec/facts.md 6장 dangerous_patterns). 판단은 지식 베이스가 한다.

type Kind = "eval" | "dangerously_set_inner_html" | "cors_wildcard" | "unauth_api_route";

const PATTERNS: { kind: Kind; re: RegExp }[] = [
  { kind: "eval", re: /\beval\s*\(|\bnew\s+Function\s*\(/g },
  { kind: "dangerously_set_inner_html", re: /\bdangerouslySetInnerHTML\b/g },
  { kind: "cors_wildcard", re: /Access-Control-Allow-Origin["']?\s*[,:]\s*["']\*["']|\borigin\s*:\s*["']\*["']/g },
];

const API_ROUTE = /(?:^|\/)(?:pages\/api\/.+|app\/(?:.+\/)?route)\.[jt]sx?$/;
// 인증 확인으로 볼 수 있는 호출·단어
const AUTH_CHECK = /getUser\s*\(|getSession\s*\(|getServerSession\s*\(|\bauth\s*\(\s*\)|currentUser\s*\(|verify(?:Id)?Token\s*\(|jwt\.verify\s*\(|\bauthorization\b|withAuth\b|requireAuth\b|clerkClient|getToken\s*\(/i;

export const patternsDetector: Detector = {
  id: "patterns",
  detect(ctx) {
    const found: { kind: Kind; file: string; line: number }[] = [];
    for (const f of ctx.files) {
      if (f.content === undefined || !isCodeFile(f.path)) continue;
      const { blanked, code } = lex(f.content); // 주석·문자열 안의 단어는 패턴으로 보지 않는다
      const line = lineIndex(f.content);
      for (const p of PATTERNS) {
        const target = p.kind === "cors_wildcard" ? code : blanked; // CORS 값은 문자열이라 code에서 본다
        for (const m of target.matchAll(p.re)) found.push({ kind: p.kind, file: f.path, line: line(m.index) });
      }
      if (API_ROUTE.test(f.path) && !AUTH_CHECK.test(code)) found.push({ kind: "unauth_api_route", file: f.path, line: 1 });
    }
    return [{ key: "dangerous_patterns", value: found }];
  },
};
