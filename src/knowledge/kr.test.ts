import { describe, expect, it } from "vitest";
import { loadDefaultKnowledge, unverifiedArticles } from "../scan.js";
import { buildResults } from "../score/results.js";
import type { PageRoute, Result } from "../types.js";
import { evaluate } from "./evaluate.js";
import { parseKnowledge } from "./loader.js";

// 실제 지식 베이스(knowledge/kr) 항목마다 통과·실패 케이스 (CLAUDE.md 테스트 규칙)
const KB = loadDefaultKnowledge();

function status(facts: Record<string, unknown>): Record<string, Result> {
  const map = new Map(Object.entries({ scan_mode: "static", ...facts }));
  const evals = new Map(KB.obligations.map((o) => [o.id, evaluate(o, map, "static", KB.labels)]));
  return Object.fromEntries(buildResults(KB.obligations, evals, {}, "static").results.map((r) => [r.id, r]));
}

const form = (consent = { present: true, optional_prechecked: false }) => ({ file: "a.tsx", line: 1, fields: [{ name: "email", kind: "email" }], consent });
const PERSONAL = { collects_personal_info: true, personal_forms: [form()] };
const POLICY_TEXT =
  "개인정보의 처리 목적 / 수집하는 개인정보 항목 / 보유 및 이용 기간 / 처리의 위탁 및 국외 이전 / Google Analytics 사용, 쿠키는 브라우저 설정에서 거부 / 외부 서비스 / 개인정보 보호책임자";
const privacy = (text?: string): PageRoute => ({ path: "/privacy", source: "file-route", ...(text ? { text } : {}) });

describe("knowledge/kr 항목별 통과·실패", () => {
  it("로드되고, 4·5단계 의무 12개가 있다", () => {
    expect(KB.obligations.map((o) => o.id).sort()).toEqual([
      "accessibility/img-alt",
      "privacy/analytics-disclosure",
      "privacy/consent-checkbox",
      "privacy/cookie-consent",
      "privacy/embed-disclosure",
      "privacy/overseas-transfer",
      "privacy/policy-contents",
      "privacy/policy-page",
      "security/dangerous-patterns",
      "security/db-access",
      "security/secret-exposure",
      "ux/terms-page",
    ]);
  });

  it("privacy/policy-page: 통과(페이지) / 실패(흔적 없음 → 차단)", () => {
    expect(status({ ...PERSONAL, pages: [privacy()] })["privacy/policy-page"]!.status).toBe("pass");
    expect(status(PERSONAL)["privacy/policy-page"]!.status).toBe("fail");
  });

  it("하위 의무 5개: 본문에 모두 있으면 통과, 처리방침 본문이 비면 실패·확인 필요", () => {
    const facts = {
      ...PERSONAL,
      overseas_services: ["Supabase"],
      analytics_scripts: [{ vendor: "ga4" }],
      external_embeds: [{ domain: "www.youtube.com", tag: "iframe" }],
    };
    const ok = status({ ...facts, pages: [privacy(POLICY_TEXT)] });
    const bad = status({ ...facts, pages: [privacy("개인정보 처리방침")] });
    for (const id of ["privacy/policy-contents", "privacy/overseas-transfer", "privacy/analytics-disclosure", "privacy/embed-disclosure", "privacy/cookie-consent"]) {
      expect(ok[id]!.status, id).toBe("pass");
      expect(bad[id]!.status, id).toMatch(/fail|needs_review/);
    }
    expect(bad["privacy/analytics-disclosure"]!.status).toBe("fail"); // auto
    expect(bad["privacy/policy-contents"]!.status).toBe("needs_review"); // semi
  });

  it("privacy/consent-checkbox: 통과 / 실패(선택 동의 기본 체크)", () => {
    expect(status(PERSONAL)["privacy/consent-checkbox"]!.status).toBe("pass");
    const r = status({ ...PERSONAL, personal_forms: [form({ present: true, optional_prechecked: true })] });
    expect(r["privacy/consent-checkbox"]!.status).toBe("fail");
  });

  it("ux/terms-page: 통과 / 실패(비치명, 차단 아님) / 결제가 있으면 N/A", () => {
    expect(status({ pages: [{ path: "/terms", source: "file-route" }] })["ux/terms-page"]!.status).toBe("pass");
    expect(status({})["ux/terms-page"]).toMatchObject({ status: "fail", grade: "medium" });
    expect(status({ payment_sdks: [{ name: "stripe" }] })["ux/terms-page"]).toMatchObject({ status: "na", naReason: "trigger" });
  });

  it("accessibility/img-alt: 통과 / 부분 통과 / 이미지 없으면 N/A", () => {
    expect(status({ img_missing_alt: { total: 2, missing: 0, items: [] } })["accessibility/img-alt"]!.status).toBe("pass");
    expect(status({ img_missing_alt: { total: 2, missing: 1, items: [{ file: "a.html", line: 3 }] } })["accessibility/img-alt"]).toMatchObject({
      status: "partial",
      score: 0.5,
    });
    expect(status({})["accessibility/img-alt"]!.status).toBe("na");
  });

  it("분류되지 않은 필드는 '기타' 대신 라벨(이름)으로", () => {
    const fields = [
      { name: "email", kind: "email", label: "이메일" },
      { name: "nickname", kind: "other", label: "닉네임" },
      { name: "school", kind: "other" },
    ];
    const r = status({ collects_personal_info: true, personal_forms: [{ ...form(), fields }] })["privacy/policy-page"]!;
    expect(r.findings[0]!.policyTodo?.map((t) => t.item)).toEqual([
      "수집 항목: 이메일",
      "분류되지 않은 항목: 닉네임(nickname), school — 처리방침에 알맞은 이름으로 적으세요",
    ]);
  });

  it("parent_hint는 표시 이름으로 (T55)", () => {
    const r = status({ ...PERSONAL, analytics_scripts: [{ vendor: "ga4" }] })["privacy/policy-page"]!;
    expect(r.findings[0]!.policyTodo?.map((t) => t.item)).toEqual(["수집 항목: 이메일", "분석 도구: Google Analytics 4", "쿠키 사용 사실과 거부 방법"]);
  });

  it("security/secret-exposure: 통과 / 실패(노출된 .env, 하드코딩 키) — 확실한 실패라 차단", () => {
    expect(status({ env_files_exposed: [], secrets_exposed: [{ via: "env_file" }] })["security/secret-exposure"]!.status).toBe("pass");
    expect(status({ env_files_exposed: [{ reason: "tracked", file: ".env", line: 1 }] })["security/secret-exposure"]!.status).toBe("fail");
    const r = status({ secrets_exposed: [{ rule: "openai-api-key", masked: "sk-p****", via: "hardcoded", file: "src/a.ts", line: 3 }] });
    expect(r["security/secret-exposure"]).toMatchObject({ status: "fail", grade: "critical", findings: [{ location: { file: "src/a.ts", line: 3 } }] });
  });

  it("T95 제한이 필요한 공개 키만 있으면 키 노출은 확인 필요 (차단 아님)", () => {
    const r = status({ public_keys_needing_restriction: [{ name: "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", file: ".env", line: 1 }] })["security/secret-exposure"]!;
    expect(r).toMatchObject({ status: "needs_review", mitigated: true });
    expect(r.findings[0]!.message).toContain("허용 도메인(HTTP 리퍼러)");
  });

  it("security/db-access: 통과 / 실패(RLS 없음) / 확인 필요(SQL 없이 .from()) / Supabase·Firebase 안 쓰면 N/A", () => {
    const base = { uses_supabase: true, supabase_migrations: ["supabase/migrations/1.sql"] };
    expect(status(base)["security/db-access"]!.status).toBe("pass");
    expect(status({ ...base, supabase_tables_without_rls: [{ table: "posts", file: "x.sql", line: 1 }] })["security/db-access"]!.status).toBe("fail");
    const review = status({ uses_supabase: true, supabase_migrations: [], supabase_from_calls: [{ file: "a.ts", line: 2 }] })["security/db-access"]!;
    expect(review).toMatchObject({ status: "needs_review", score: 0.5, mitigated: true });
    expect(review.findings[0]!.message).toContain("Supabase 대시보드에서 테이블의 RLS가 켜져 있는지 확인하세요");
    expect(status({})["security/db-access"]!.status).toBe("na");
  });

  it("T96·T97 누구나 읽기·추가 정책 → db-access 확인 필요 (차단 아님), 수정·삭제만 있으면 영향 없음", () => {
    const base = { uses_supabase: true, supabase_migrations: ["1.sql"] };
    for (const command of ["select", "insert"]) {
      const r = status({ ...base, supabase_open_policies: [{ table: "posts", command, file: "1.sql", line: 3 }] })["security/db-access"]!;
      expect(r, command).toMatchObject({ status: "needs_review", mitigated: true });
      expect(r.findings[0]!.message).toContain("누구나 읽거나 추가할 수 있는 정책");
    }
    expect(status({ ...base, supabase_open_policies: [{ table: "posts", command: "update" }] })["security/db-access"]!.status).toBe("pass");
  });

  it("T98·T99 security/rls-open-write (정답지 추가 승인 대기 중인 YAML): 수정·삭제·전부 → 높음 등급 확인 필요", () => {
    const [o] = parseKnowledge([["rls.yaml", RLS_OPEN_WRITE_YAML]]);
    const run = (facts: Record<string, unknown>) => {
      const map = new Map(Object.entries({ scan_mode: "static", uses_supabase: true, ...facts }));
      return buildResults([o!], new Map([[o!.id, evaluate(o!, map, "static")]]), {}, "static").results[0]!;
    };
    for (const command of ["update", "delete", "all"]) {
      expect(run({ supabase_open_policies: [{ table: "posts", command, file: "1.sql", line: 5 }] }), command).toMatchObject({
        status: "needs_review",
        grade: "high",
        findings: [{ location: { file: "1.sql", line: 5 } }],
      });
    }
    expect(run({ supabase_open_policies: [{ table: "posts", command: "select" }] }).status).toBe("pass");
    expect(run({ supabase_open_policies: [] }).status).toBe("pass");
  });

  it("security/dangerous-patterns: 통과 / 확인 필요(semi)", () => {
    expect(status({ dangerous_patterns: [] })["security/dangerous-patterns"]!.status).toBe("pass");
    expect(status({ dangerous_patterns: [{ kind: "eval", file: "a.ts", line: 1 }] })["security/dangerous-patterns"]!.status).toBe("needs_review");
  });

  it("법적 항목의 조문은 모두 미확인(TODO)이고 references가 있다, 약관·보안은 principle 없음", () => {
    for (const o of KB.obligations) {
      if (o.id === "ux/terms-page" || o.category === "security") expect(o.principle).toBeUndefined();
      else expect(o.principle, o.id).toMatchObject({ article: "TODO-확인필요", source: null, verified_at: null, references: expect.any(Array) });
    }
    const results = Object.values(status({ ...PERSONAL, pages: [privacy()] }));
    expect(unverifiedArticles(results)).toEqual(["privacy/policy-page", "privacy/policy-contents", "privacy/consent-checkbox"]);
  });
});

// 승인되면 knowledge/kr/security.yaml에 그대로 옮긴다 (정답지 4개에 키 추가가 필요해 대기 중)
const RLS_OPEN_WRITE_YAML = `
- id: security/rls-open-write
  category: security
  check: semi
  # L2: 보안 관행 / I3: 누구나 데이터를 바꾸거나 지울 수 있음 / P2: 가끔 발생 → 12 높음
  factors: { L: 2, I: 3, P: 2 }
  trigger: uses_supabase
  evidence:
    - none: { fact: supabase_open_policies, field: command, in: [update, delete, all] }
  message: 누구나 수정·삭제할 수 있는 정책(using (true))이 있습니다.
  fix: >-
    정책 조건을 auth.uid() = user_id처럼 본인 데이터로 좁히세요.
    의도한 공개 쓰기라면 confirmations에 "security/rls-open-write": "pass"를 적으세요.
`;
