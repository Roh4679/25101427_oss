import { describe, expect, it } from "vitest";
import { gitignoreMatcher } from "../../scanner/gitignore.js";
import type { Detector, SourceFile } from "../../types.js";
import { databaseDetector, tablesWithoutRls } from "./database.js";
import { patternsDetector } from "./patterns.js";
import { mask, secretsDetector } from "./secrets.js";

const file = (path: string, content = ""): SourceFile => ({ path, content });
const run = (d: Detector, files: SourceFile[]) =>
  Object.fromEntries(d.detect({ root: "/", files, mode: "static" }).map((f) => [f.key, f.value])) as Record<string, unknown>;
// 테스트용 키는 조립해서 만든다 (저장소에 키 모양 문자열을 두지 않는다, fixtures/README.md)
const KEY = ["sk", "proj", "TESTONLY", "x".repeat(24)].join("-");

describe(".gitignore 해석 (git 없을 때)", () => {
  const ignored = gitignoreMatcher([file(".gitignore", ".env*\n!.env.example\nnode_modules/\n/build\n"), file("apps/.gitignore", "secret.txt\n")]);
  it.each([
    [".env", true],
    [".env.local", true],
    [".env.example", false], // T75 부정 패턴
    ["apps/web/.env", true], // 슬래시 없는 패턴은 어느 깊이든
    ["node_modules/a/index.js", true], // 폴더 규칙
    ["build/out.js", true],
    ["src/build/out.js", false], // 앞 / = 루트 기준
    ["apps/secret.txt", true], // 하위 .gitignore
    ["secret.txt", false],
  ])("%s → %s", (p, v) => expect(ignored(p)).toBe(v));
});

describe("secrets (T64~T71)", () => {
  const detect = (files: SourceFile[], tracked?: string[], ignoredPaths: string[] = []) =>
    run(secretsDetector({ tracked, ignored: (p) => ignoredPaths.includes(p) }), files);

  it("T64 무시되고 추적되지 않은 .env → 노출 없음", () => {
    expect(detect([file(".env", "A=1")], [], [".env"]).env_files_exposed).toEqual([]);
  });
  it("T65 무시되지만 추적됨 → tracked", () => {
    expect(detect([file(".env", "A=1")], [".env"], [".env"]).env_files_exposed).toEqual([{ reason: "tracked", file: ".env", line: 1 }]);
  });
  it("T66 무시되지 않음 → not_ignored, T72 추적 정보 없으면 git_tracked null", () => {
    const out = detect([file(".env", "A=1")]);
    expect(out.env_files_exposed).toEqual([{ reason: "not_ignored", file: ".env", line: 1 }]);
    expect(out.env_files).toEqual([{ path: ".env", gitignored: false, git_tracked: null }]);
  });
  it("T67 .env.example은 env 파일이 아니다", () => {
    expect(detect([file(".env.example", "OPENAI_API_KEY=")]).env_files).toEqual([]);
  });
  it("T68 클라이언트 변수의 비밀값 → public_env (마스킹)", () => {
    expect(detect([file(".env", `NEXT_PUBLIC_OPENAI_API_KEY=${KEY}`)], [], [".env"]).secrets_exposed).toEqual([
      { rule: "openai-api-key", masked: "sk-p****", via: "public_env", file: ".env", line: 1 },
    ]);
  });
  it("T69 VITE_ 이름의 비밀 변수 → public_env", () => {
    expect(detect([file(".env", "VITE_STRIPE_SECRET_KEY=whatever")]).secrets_exposed).toMatchObject([{ via: "public_env", rule: "env:VITE_STRIPE_SECRET_KEY" }]);
  });
  it("T70 소스에 직접 쓴 키 → hardcoded, 원문은 Fact에 없다", () => {
    const out = detect([file("src/api.ts", `const k = "${KEY}";`)]);
    expect(out.secrets_exposed).toEqual([{ rule: "openai-api-key", masked: "sk-p****", via: "hardcoded", file: "src/api.ts", line: 1 }]);
    expect(JSON.stringify(out)).not.toContain(KEY);
  });
  it("T71 공개용 키(anon, Firebase web apiKey)·서버 전용 변수 → 클라이언트 노출 아님", () => {
    const out = detect([
      file(".env", "NEXT_PUBLIC_SUPABASE_ANON_KEY=abc\nNEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyTEST\nSUPABASE_SERVICE_ROLE_KEY=abc"),
      file("src/firebase.ts", 'const cfg = { apiKey: "AIzaSyTESTONLY00000000000000000000000" };'),
    ], [], [".env"]);
    expect(out.secrets_exposed).toEqual([{ rule: "env:SUPABASE_SERVICE_ROLE_KEY", masked: "abc****", via: "env_file", file: ".env", line: 3 }]);
  });
  it("주석 속 키는 잡지 않는다, mask는 앞 4자", () => {
    expect(detect([file("src/a.ts", `// ${KEY}`)]).secrets_exposed).toEqual([]);
    expect(mask("abcdefgh")).toBe("abcd****");
  });
});

describe("database (T80~T89)", () => {
  const sql = (path: string, s: string) => file(path, s);
  it("T80 RLS 활성화가 없는 public 테이블 (위치 포함)", () => {
    expect(tablesWithoutRls([sql("supabase/migrations/1.sql", "-- 메모\ncreate table public.posts (id int);")])).toEqual([
      { table: "posts", file: "supabase/migrations/1.sql", line: 2 },
    ]);
  });
  it("T81 RLS 켬, 다른 스키마·주석 속 SQL은 무시", () => {
    const s = `create table if not exists "profiles" (id uuid);
alter table public.profiles enable row level security;
create table private.logs (id int);
/* create table public.ghost (id int); */`;
    expect(tablesWithoutRls([sql("supabase/migrations/1.sql", s)])).toEqual([]);
  });
  it("T87 다음 파일에서 켬 → 통과, T88 뒤에서 끔 → 실패", () => {
    const a = sql("supabase/migrations/1.sql", "create table posts (id int);");
    const on = sql("supabase/migrations/2.sql", "alter table only posts enable row level security;");
    const off = sql("supabase/migrations/3.sql", "alter table posts disable row level security;");
    expect(tablesWithoutRls([a, on])).toEqual([]);
    expect(tablesWithoutRls([a, on, off]).map((t) => t.table)).toEqual(["posts"]);
  });
  it("T82 SQL 없음 + .from() 호출 / T86 인증만 쓰면 호출 없음", () => {
    const out = run(databaseDetector, [file("lib/db.ts", 'import { createClient } from "@supabase/supabase-js";\nawait supabase.from("posts").select();')]);
    expect(out.supabase_migrations).toEqual([]);
    expect(out.supabase_from_calls).toEqual([{ file: "lib/db.ts", line: 2 }]);
    expect(run(databaseDetector, [file("a.ts", "await supabase.auth.signUp({});")]).supabase_from_calls).toEqual([]);
    expect(run(databaseDetector, [file("a.ts", "Array.from([1])")]).supabase_from_calls).toEqual([]);
  });
  it("T83 클라이언트 파일의 service_role / T85 서버 파일은 통과", () => {
    const pkg = file("package.json", '{"dependencies":{"next":"14"}}');
    const client = file("app/admin/page.tsx", '"use client";\nconst k = process.env.SUPABASE_SERVICE_ROLE_KEY;');
    const server = file("app/api/admin/route.ts", "const k = process.env.SUPABASE_SERVICE_ROLE_KEY;");
    expect(run(databaseDetector, [pkg, client]).service_role_in_client).toEqual([{ file: "app/admin/page.tsx", line: 2 }]);
    expect(run(databaseDetector, [pkg, server]).service_role_in_client).toEqual([]);
  });
  it("T84 NEXT_PUBLIC_*SERVICE_ROLE* 이름은 .env에 있어도 노출", () => {
    expect(run(databaseDetector, [file(".env", "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=x")]).service_role_in_client).toEqual([{ file: ".env", line: 1 }]);
  });
  it("T89 Firebase 규칙: if true·조건 없는 allow는 열림, 인증 조건은 통과", () => {
    const open = file("firestore.rules", "match /{doc=**} {\n  allow read, write: if true;\n}");
    const ok = file("storage.rules", "allow read: if request.auth != null;");
    const rtdb = file("database.rules.json", '{ "rules": { ".read": true } }');
    expect(run(databaseDetector, [open, ok, rtdb]).firebase_open_rules).toEqual([
      { file: "firestore.rules", line: 2 },
      { file: "database.rules.json", line: 1 },
    ]);
  });
});

describe("patterns (SEC-03)", () => {
  it("eval·dangerouslySetInnerHTML·CORS *·인증 없는 API 라우트 (실패 케이스)", () => {
    const out = run(patternsDetector, [
      file("src/a.ts", 'eval(code);\nres.setHeader("Access-Control-Allow-Origin", "*");'),
      file("src/b.tsx", "<div dangerouslySetInnerHTML={{ __html: x }} />"),
      file("app/api/posts/route.ts", "export async function GET() { return Response.json([]); }"),
    ]);
    expect((out.dangerous_patterns as { kind: string }[]).map((p) => p.kind)).toEqual(["eval", "cors_wildcard", "dangerously_set_inner_html", "unauth_api_route"]);
  });
  it("통과 케이스: 주석·문자열 속 단어, 인증을 확인하는 API 라우트", () => {
    const out = run(patternsDetector, [
      file("src/a.ts", '// eval(x)\nconst s = "dangerouslySetInnerHTML";'),
      file("pages/api/me.ts", "const { data } = await supabase.auth.getUser(); export default function h() {}"),
    ]);
    expect(out.dangerous_patterns).toEqual([]);
  });
});
