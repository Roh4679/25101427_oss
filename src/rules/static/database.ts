import { isCodeFile, isHtmlFile, lex, lineIndex } from "../../scanner/source.js";
import type { Detector, Loc, SourceFile } from "../../types.js";

// DB 접근 권한 (docs/spec/facts.md 6장): Supabase 마이그레이션·RLS·.from() 호출·service_role, Firebase 규칙

const stripSql = (sql: string) => sql.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
// public 스키마(또는 스키마 생략) 테이블 이름. "Quoted" 이름은 따옴표를 뗀다.
const TABLE = String.raw`(?:(?:"?public"?)\.)?"?([A-Za-z_][\w]*)"?`;
const CREATE = new RegExp(String.raw`\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:(?:"?(\w+)"?)\.)?"?([A-Za-z_]\w*)"?`, "gi");
const RLS = new RegExp(String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${TABLE}\s+(enable|disable)\s+row\s+level\s+security`, "gi");

// create policy "이름" on [public.]테이블 [as permissive] [for 명령] [to 역할] [using (...)] [with check (...)];
const POLICY = new RegExp(String.raw`\bcreate\s+policy\s+(?:"[^"]*"|\w+)\s+on\s+(?:(?:"?(\w+)"?)\.)?"?([A-Za-z_]\w*)"?([^;]*);`, "gi");
const OPEN_CLAUSE = /\busing\s*\(\s*true\s*\)|\bwith\s+check\s*\(\s*true\s*\)/i;

export type PolicyCommand = "select" | "insert" | "update" | "delete" | "all";

// 조건이 true뿐인 정책 = 누구나 그 명령을 쓸 수 있다
export function openPolicies(migrations: SourceFile[]): ({ table: string; command: PolicyCommand } & Loc)[] {
  return migrations.flatMap((f) => {
    const sql = stripSql(f.content ?? "");
    const line = lineIndex(sql);
    return [...sql.matchAll(POLICY)].flatMap((m) => {
      if ((m[1] ?? "public").toLowerCase() !== "public" || !OPEN_CLAUSE.test(m[3]!)) return [];
      const command = (m[3]!.match(/\bfor\s+(select|insert|update|delete|all)\b/i)?.[1]?.toLowerCase() ?? "all") as PolicyCommand;
      return [{ table: m[2]!.toLowerCase(), command, file: f.path, line: line(m.index) }];
    });
  });
}

export function tablesWithoutRls(migrations: SourceFile[]): ({ table: string } & Loc)[] {
  const created = new Map<string, Loc>();
  const enabled = new Map<string, boolean>();
  for (const f of migrations) {
    const sql = stripSql(f.content ?? "");
    const line = lineIndex(sql);
    for (const m of sql.matchAll(CREATE)) {
      const schema = (m[1] ?? "public").toLowerCase();
      if (schema === "public") created.set(m[2]!.toLowerCase(), { file: f.path, line: line(m.index) });
    }
    for (const m of sql.matchAll(RLS)) enabled.set(m[1]!.toLowerCase(), m[2]!.toLowerCase() === "enable");
  }
  return [...created].filter(([t]) => enabled.get(t) !== true).map(([table, loc]) => ({ table, ...loc }));
}

// 클라이언트 번들 대상 파일인지 (facts.md 6장)
export function isClientFile(f: SourceFile, next: boolean): boolean {
  const p = f.path;
  if (/(?:^|\/)app\/.*\broute\.[jt]sx?$|(?:^|\/)pages\/api\/|\.server\.[jt]sx?$|(?:^|\/)supabase\/functions\//.test(p)) return false;
  const head = (f.content ?? "").slice(0, 200);
  if (/^\s*["']use server["']/m.test(head)) return false;
  if (/^\s*["']use client["']/m.test(head)) return true;
  if (/(?:^|\/)(?:components|pages)\//.test(p)) return true;
  return !next && (isHtmlFile(p) || /^src\//.test(p));
}

const SERVICE_ROLE_USE = /service_role|SERVICE_ROLE_KEY/i;
const PUBLIC_SERVICE_ROLE = /\b(?:NEXT_PUBLIC_|VITE_|REACT_APP_|EXPO_PUBLIC_)\w*SERVICE_ROLE\w*/;
const USES_SUPABASE = /@supabase\/|\bsupabase\b/;
const FROM_CALL = /\.from\(\s*["'`]/g;

function firebaseOpenRules(f: SourceFile): Loc[] {
  const src = f.content ?? "";
  const line = lineIndex(src);
  if (/(?:^|\/)(?:firestore|storage)\.rules$/.test(f.path)) {
    const code = src.replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
    // allow read, write: if true;  또는 조건 없이 allow read;
    return [...code.matchAll(/\ballow\s+[\w\s,]+?(?::\s*if\s+true\s*;|;)/g)].map((m) => ({ file: f.path, line: line(m.index) }));
  }
  if (/(?:^|\/)database\.rules\.json$/.test(f.path)) {
    return [...src.matchAll(/"\.(?:read|write)"\s*:\s*(?:true|"true")/g)].map((m) => ({ file: f.path, line: line(m.index) }));
  }
  return [];
}

export const databaseDetector: Detector = {
  id: "database",
  detect(ctx) {
    const migrations = ctx.files.filter((f) => /^supabase\/.*\.sql$/.test(f.path) || /(?:^|\/)supabase\/migrations\/.*\.sql$/.test(f.path));
    const pkg = ctx.files.find((f) => f.path === "package.json")?.content ?? "";
    const next = /"next"\s*:/.test(pkg);
    const code = ctx.files.filter((f) => f.content !== undefined && isCodeFile(f.path));

    const from_calls: Loc[] = [];
    const service_role: Loc[] = [];
    for (const f of code) {
      const { code: c } = lex(f.content!);
      const line = lineIndex(f.content!);
      if (USES_SUPABASE.test(c)) for (const m of c.matchAll(FROM_CALL)) from_calls.push({ file: f.path, line: line(m.index) });
      if (isClientFile(f, next)) {
        const m = c.match(SERVICE_ROLE_USE);
        if (m) service_role.push({ file: f.path, line: line(m.index ?? 0) });
      }
    }
    // NEXT_PUBLIC_*SERVICE_ROLE* 이름은 어디에 있든 클라이언트로 나간다 (.env 포함)
    for (const f of ctx.files) {
      if (f.content === undefined || !(isCodeFile(f.path) || /(?:^|\/)\.env/.test(f.path))) continue;
      if (isCodeFile(f.path) && isClientFile(f, next)) continue; // 위에서 이미 봤다
      const m = f.content.match(PUBLIC_SERVICE_ROLE);
      if (m) service_role.push({ file: f.path, line: lineIndex(f.content)(m.index ?? 0) });
    }

    return [
      { key: "supabase_migrations", value: migrations.map((f) => f.path) },
      { key: "supabase_tables_without_rls", value: tablesWithoutRls(migrations) },
      { key: "supabase_open_policies", value: openPolicies(migrations) },
      { key: "supabase_from_calls", value: from_calls },
      { key: "service_role_in_client", value: service_role },
      { key: "firebase_open_rules", value: ctx.files.flatMap(firebaseOpenRules) },
    ];
  },
};
