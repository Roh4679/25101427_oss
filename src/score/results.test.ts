import { describe, expect, it } from "vitest";
import type { Config } from "../config.js";
import { evaluate, renderHint } from "../knowledge/evaluate.js";
import { join } from "node:path";
import { loadLabels } from "../knowledge/labels.js";
import { testKb } from "../knowledge/test-kb.js";
import type { PageRoute, Result } from "../types.js";
import { summarize } from "./index.js";
import { buildResults } from "./results.js";

// 테스트 지식 베이스 + Fact → 결과·점수 (docs/scoring.md 5장)
const KB = testKb();
const LABELS = loadLabels(join(import.meta.dirname, "../../knowledge/kr/labels.yaml"));

function run(facts: Record<string, unknown>, config: Config = {}, mode: "static" | "live" = "static") {
  const map = new Map(Object.entries({ scan_mode: mode, ...facts }));
  const evals = new Map(KB.map((o) => [o.id, evaluate(o, map, mode, LABELS)]));
  const { results, warnings } = buildResults(KB, evals, config, mode);
  const byId = Object.fromEntries(results.map((r) => [r.id, r])) as Record<string, Result>;
  return { byId, summary: summarize(results), warnings, results };
}

const text = (...texts: string[]) => texts.map((t) => ({ text: t, source: "string", file: "src/a.tsx", line: 1 }));
const form = { file: "app/signup/page.tsx", line: 3, fields: [{ name: "email", kind: "email" }], consent: { present: true, optional_prechecked: false } };
const PERSONAL = { collects_personal_info: true, personal_forms: [form] };
const PAY = { payment_sdks: [{ name: "stripe", file: "package.json", line: 1 }] };
const privacyPage = (over: Partial<PageRoute> = {}): PageRoute => ({ path: "/privacy", source: "file-route", ...over });
const TERMS = { pages: [{ path: "/terms", source: "file-route" }] as PageRoute[] };

describe("확실성 — 환불 정책 (T1~T8, T43, T44, T53)", () => {
  const refund = (facts: Record<string, unknown>, config?: Config) => run({ ...PAY, ...facts }, config).byId["commerce/refund-policy"]!;

  it("T1 흔적 없음 → fail, 차단", () => {
    const r = run(PAY);
    expect(r.byId["commerce/refund-policy"]).toMatchObject({ status: "fail", score: 0 });
    expect(r.summary.verdict).toBe("blocked");
    expect(r.summary.blockers).toContain("commerce/refund-policy");
  });
  it("T2 결제 컴포넌트에만 '청약철회' → needs_review 0.5, mitigated, 차단 없음", () => {
    expect(refund({ all_text: text("7일 이내 청약철회 가능") })).toMatchObject({ status: "needs_review", score: 0.5, mitigated: true });
  });
  it("T5 약관 페이지 본문에 '청약철회' → pass", () => {
    expect(refund({ pages: [{ path: "/terms", source: "file-route", text: "제10조 청약철회 기간" }] }).status).toBe("pass");
  });
  it("T6 푸터에 '환불 정책' → pass", () => {
    expect(refund({ footer_text: "회사소개 | 환불 정책 | 이용약관" }).status).toBe("pass");
  });
  it("T7 /refund 전용 페이지 → pass", () => {
    expect(refund({ pages: [{ path: "/refund", source: "file-route" }] }).status).toBe("pass");
  });
  it("T8 '환불은 고객센터로 문의'만 → fail (흔적 아님)", () => {
    expect(refund({ all_text: text("환불은 고객센터로 문의") })).toMatchObject({ status: "fail", mitigated: false });
  });
  it.each(["교환·반품 안내", "교환/반품", "반품 안내", "취소·환불", "환불 안내", "환불 정책"])("T43·T53 '%s' → 흔적 있음, needs_review", (t) => {
    expect(refund({ all_text: text(t) }).status).toBe("needs_review");
  });
  it("없어서 문제: 찾아본 곳 (라우트 수, 푸터 파일, 화면 텍스트 수)", () => {
    const r = refund({
      pages: [{ path: "/", source: "file-route" }, { path: "/about", source: "file-route" }, { path: "https://blog.x.com", source: "footer-link", link_text: "블로그" }],
      footer_links: [{ text: "블로그", href: "https://blog.x.com", file: "app/layout.tsx", line: 20 }],
      all_text: text("환영합니다", "가입하기"),
    });
    expect(r.findings[0]!.searched).toEqual({ routes: 2, footer: ["app/layout.tsx"], texts: 2 });
    expect(r.findings[0]!.location).toBeUndefined();
  });
  it("있어서 문제: 위치만 (찾아본 곳 없음)", () => {
    const r = run({ ...PERSONAL, personal_forms: [{ ...form, consent: { present: true, optional_prechecked: true } }] });
    expect(r.byId["privacy/consent-checkbox"]!.findings[0]).toMatchObject({ location: { file: "app/signup/page.tsx", line: 3 } });
    expect(r.byId["privacy/consent-checkbox"]!.findings[0]!.searched).toBeUndefined();
  });
  it("T44 차단 메시지와 해결 방법", () => {
    const r = refund({});
    expect(r.message).toBe("청약철회(환불) 기간·방법 안내가 보이지 않습니다.");
    expect(r.fix).toContain("pages.refundPolicy");
    expect(r.fix).toContain('"commerce/refund-policy": "pass"');
  });
});

describe("확실성 — 사업자 정보 (T9~T13)", () => {
  const biz = (...t: string[]) => run({ ...PAY, all_text: text(...t) }).byId["commerce/business-info"]!;
  it("T9 4항목 모두 없음 → fail", () => expect(biz().status).toBe("fail"));
  it("T10 '상호', '대표'만 → fail (흔적 없음)", () => expect(biz("상호: 바이브", "대표: 홍길동").status).toBe("fail"));
  it("T11 '사업자등록번호'만 → needs_review 0.5 (0.25가 아님)", () => {
    expect(biz("사업자등록번호")).toMatchObject({ status: "needs_review", score: 0.5 });
  });
  it("T12 번호 형식 + 상호 + 대표자 (3/4) → needs_review 0.5", () => {
    expect(biz("상호 바이브", "대표자 홍길동", "123-45-67890")).toMatchObject({ status: "needs_review", score: 0.5 });
  });
  it("T13 4항목 모두 → pass", () => {
    expect(biz("상호 바이브", "대표자 홍길동", "사업자등록번호 123-45-67890", "통신판매업 신고 제2026-서울-0000호").status).toBe("pass");
  });
});

describe("확실성 — 처리방침 (T14~T18, T51, T51b, T52)", () => {
  const policy = (facts: Record<string, unknown>) => run({ ...PERSONAL, ...facts }).byId["privacy/policy-page"]!;
  it("T14 흔적 없음 → fail, 차단", () => {
    expect(run(PERSONAL).summary.blockers).toContain("privacy/policy-page");
  });
  it("T15 '개인정보 수집·이용 동의'만 → fail (흔적 아님)", () => {
    expect(policy({ all_text: text("[필수] 개인정보 수집·이용 동의") }).status).toBe("fail");
  });
  it("T16·T51 라벨 '개인정보 처리방침에 동의합니다'만 → needs_review, 차단 없음", () => {
    expect(policy({ all_text: text("개인정보 처리방침에 동의합니다") })).toMatchObject({ status: "needs_review", mitigated: true });
  });
  it("T17 푸터의 노션 외부 링크 → pass", () => {
    const link = { path: "https://x.notion.site/abc", external: "https://x.notion.site/abc", source: "footer-link", link_text: "개인정보처리방침" };
    expect(policy({ pages: [link] }).status).toBe("pass");
  });
  it("T18 /privacy 페이지, 링크 텍스트 'Privacy' → pass", () => {
    expect(policy({ pages: [privacyPage({ link_text: "Privacy" })] }).status).toBe("pass");
  });
  it("T51b 링크 텍스트 '개인정보 처리방침' (공백) → pass", () => {
    expect(policy({ pages: [{ path: "https://example.com/a", source: "footer-link", link_text: "개인정보 처리방침" }] }).status).toBe("pass");
  });
  it("T52 '개인정보  처리\\u00a0방침' → 흔적 있음", () => {
    expect(policy({ all_text: text("개인정보  처리 방침") }).status).toBe("needs_review");
  });
});

describe("사람 확인, 해당 없음, 비치명 (T19~T23)", () => {
  it("T19 흔적 있음 + confirmations fail → fail, confirmed, 차단", () => {
    const r = run({ ...PAY, all_text: text("청약철회") }, { confirmations: { "commerce/refund-policy": "fail" } });
    expect(r.byId["commerce/refund-policy"]).toMatchObject({ status: "fail", confirmed: true, mitigated: false });
    expect(r.summary.verdict).toBe("blocked");
  });
  it("T20 흔적 없음 + confirmations pass → pass, 차단 없음", () => {
    const r = run(PAY, { confirmations: { "commerce/refund-policy": "pass" } });
    expect(r.byId["commerce/refund-policy"]).toMatchObject({ status: "pass", score: 1, confirmed: true });
    expect(r.summary.blockers).not.toContain("commerce/refund-policy");
  });
  it("T21 결제 SDK 없음 → 환불·사업자 정보 na (trigger)", () => {
    const r = run({});
    expect(r.byId["commerce/refund-policy"]).toMatchObject({ status: "na", score: null, naReason: "trigger" });
    expect(r.byId["commerce/business-info"]!.status).toBe("na");
  });
  it("T22 약관 페이지 없음 (비치명 auto) → fail 0, 차단 없음", () => {
    const r = run({});
    expect(r.byId["ux/terms-page"]).toMatchObject({ status: "fail", score: 0, grade: "medium" });
    expect(r.summary.verdict).not.toBe("blocked");
  });
  it("T23 비치명 auto에 confirmations → 경고, 무시", () => {
    const r = run({}, { confirmations: { "ux/terms-page": "pass" } });
    expect(r.byId["ux/terms-page"]).toMatchObject({ status: "fail", confirmed: false });
    expect(r.warnings.join()).toMatch(/ux\/terms-page.*무시/);
  });
});

describe("하위 의무 depends_on (T36~T41)", () => {
  const CHILDREN = ["privacy/policy-contents", "privacy/analytics-disclosure", "privacy/cookie-consent"];
  const GA = { analytics_scripts: [{ vendor: "ga4", file: "pages/_app.tsx", line: 5 }] };

  it("T36 처리방침 fail → 하위 na (dependency), 분모에서 빠짐", () => {
    const r = run({ ...PERSONAL, ...GA });
    for (const id of CHILDREN) expect(r.byId[id]).toMatchObject({ status: "na", naReason: "dependency", score: null });
  });
  it("T37 처리방침 needs_review → 하위 na", () => {
    const r = run({ ...PERSONAL, all_text: text("개인정보처리방침") });
    expect(r.byId["privacy/policy-contents"]).toMatchObject({ status: "na", naReason: "dependency" });
  });
  it("T38 처리방침 pass, 필수 항목 일부 → needs_review s", () => {
    const r = run({ ...PERSONAL, pages: [privacyPage({ text: "이용목적: 회원 관리. 보유기간: 탈퇴 시까지." })] });
    expect(r.byId["privacy/policy-contents"]).toMatchObject({ status: "needs_review", score: 2 / 3 });
  });
  it("T39 처리방침 needs_review + confirmations pass → 하위 정상 평가", () => {
    const r = run({ ...PERSONAL, all_text: text("개인정보처리방침") }, { confirmations: { "privacy/policy-page": "pass" } });
    expect(r.byId["privacy/policy-page"]!.status).toBe("pass");
    expect(r.byId["privacy/policy-contents"]!.status).toBe("needs_review"); // 페이지를 못 찾음 → semi
  });
  it("T40 개인정보 수집 안 함 → 처리방침·하위 모두 na", () => {
    const r = run({});
    expect(r.byId["privacy/policy-page"]!.status).toBe("na");
    expect(r.byId["privacy/policy-contents"]!.status).toBe("na");
  });
  it("T41 상위가 pass가 아니면 하위 confirmations 무시", () => {
    const r = run(PERSONAL, { confirmations: { "privacy/policy-contents": "pass" } });
    expect(r.byId["privacy/policy-contents"]).toMatchObject({ status: "na", naReason: "dependency", confirmed: false });
    expect(r.warnings.join()).toMatch(/policy-contents.*상위 의무/);
  });
});

describe("설정 파일 pages (T45~T47, 정적)", () => {
  const notion = { path: "https://example.notion.site/privacy", external: "https://example.notion.site/privacy", source: "config", kind: "privacy" };
  it("T45 노션 URL 지정 → pass, 미검증 표시", () => {
    const r = run({ ...PERSONAL, pages: [notion] });
    expect(r.byId["privacy/policy-page"]).toMatchObject({ status: "pass", configPage: { url: notion.external, verified: false } });
  });
  it("T46 외부 본문은 못 읽음 → 필수 항목 needs_review 0.5", () => {
    expect(run({ ...PERSONAL, pages: [notion] }).byId["privacy/policy-contents"]).toMatchObject({ status: "needs_review", score: 0.5 });
  });
  it("T47 pages.refundPolicy '/refund', 흔적 없음 → pass", () => {
    const r = run({ ...PAY, pages: [{ path: "/refund", source: "config", kind: "refund" }] });
    expect(r.byId["commerce/refund-policy"]).toMatchObject({ status: "pass", configPage: { url: "/refund", verified: false } });
  });
});

describe("상위 실패 시 처리방침 포함 항목 (T55~T59)", () => {
  const GA = { analytics_scripts: [{ vendor: "ga4", file: "pages/_app.tsx", line: 5 }] };
  const todo = (r: ReturnType<typeof run>) => r.byId["privacy/policy-page"]!.findings.flatMap((f) => f.policyTodo ?? []);

  it("T55 처리방침 fail + GA + 폼 → 지식 베이스 순서로 항목, 점수 영향 없음", () => {
    const withHints = run({ ...PERSONAL, ...GA, ...TERMS });
    expect(todo(withHints)).toEqual([
      { from: "privacy/policy-contents", item: "수집 항목: 이메일" },
      { from: "privacy/analytics-disclosure", item: "분석 도구: Google Analytics 4" },
      { from: "privacy/cookie-consent", item: "쿠키 사용 사실과 거부 방법" },
    ]);
    for (const id of ["privacy/policy-contents", "privacy/analytics-disclosure", "privacy/cookie-consent"]) {
      expect(withHints.byId[id]!.status).toBe("na");
    }
  });
  it("T56 해외 서비스 중복 없이 ', '로 연결", () => {
    expect(renderHint("해외 서버로 이전될 수 있음: {overseas_services}", new Map([["overseas_services", ["Supabase", "OpenAI", "Supabase"]]]))).toBe(
      "해외 서버로 이전될 수 있음: Supabase, OpenAI",
    );
  });
  it("T57 분석 툴·해외 서비스 없음 → 수집 항목만", () => {
    expect(todo(run(PERSONAL)).map((t) => t.from)).toEqual(["privacy/policy-contents"]);
  });
  it("T57a 채울 값이 비면 그 줄을 뺀다 (폼 없이 가입 API만 있음)", () => {
    const r = run({ collects_personal_info: true, personal_forms: [], ...GA });
    expect(todo(r).map((t) => t.from)).toEqual(["privacy/analytics-disclosure", "privacy/cookie-consent"]);
  });
  it("T58 처리방침 needs_review → 항목 없음", () => {
    expect(todo(run({ ...PERSONAL, ...GA, all_text: text("개인정보처리방침") }))).toEqual([]);
  });
  it("T59 fail + confirmations pass → 항목 없음, 하위 정상 평가", () => {
    const r = run({ ...PERSONAL, ...GA }, { confirmations: { "privacy/policy-page": "pass" } });
    expect(todo(r)).toEqual([]);
    expect(r.byId["privacy/analytics-disclosure"]!.status).toBe("fail"); // auto, 페이지 없음
  });
});

describe("N/A 이유, 설정", () => {
  it("T62 live 전용 의무를 정적 모드로 → na (mode)", () => {
    expect(run({ analytics_scripts: [{ vendor: "ga4" }] }).byId["privacy/cookie-before-consent"]).toMatchObject({ status: "na", naReason: "mode" });
  });
  it("live 모드에서는 평가한다 (T61, T63)", () => {
    const facts = { analytics_scripts: [{ vendor: "ga4" }] };
    expect(run({ ...facts, cookies_before_consent: [{ name: "_ga", domain: "x", url: "/" }] }, {}, "live").byId["privacy/cookie-before-consent"]!.status).toBe("fail");
    expect(run({ ...facts, cookies_before_consent: [] }, {}, "live").byId["privacy/cookie-before-consent"]!.status).toBe("pass");
  });
  it("disable → na (disabled), 다른 이유보다 우선", () => {
    expect(run({}, { disable: ["commerce/refund-policy"] }).byId["commerce/refund-policy"]).toMatchObject({ status: "na", naReason: "disabled" });
  });
  it("factors 덮어쓰기, weightMode raw", () => {
    const r = run({}, { factors: { "ux/terms-page": { L: 3, I: 3, P: 3 } }, weightMode: "raw" });
    expect(r.byId["ux/terms-page"]).toMatchObject({ risk: 27, grade: "critical", weight: 27 });
  });
  it("모르는 id의 설정은 경고", () => {
    expect(run({}, { confirmations: { "x/none": "pass" }, disable: ["x/none"] }).warnings).toHaveLength(2);
  });
  it("auto 비치명 partial은 partial, semi는 needs_review", () => {
    const r = run({ buttons: [{ label: "가입하기" }, { label: "클릭", file: "a.tsx", line: 2 }] });
    expect(r.byId["ux/button-labels"]).toMatchObject({ status: "needs_review", score: 0.5 });
    expect(r.byId["ux/button-labels"]!.findings[0]!.location).toEqual({ file: "a.tsx", line: 2 });
  });
  it("동의 체크박스: 선택 동의 기본 체크 → fail, 차단 (흔적 없는 치명)", () => {
    const r = run({ ...PERSONAL, personal_forms: [{ ...form, consent: { present: true, optional_prechecked: true } }] });
    expect(r.byId["privacy/consent-checkbox"]).toMatchObject({ status: "fail" });
    expect(r.summary.blockers).toContain("privacy/consent-checkbox");
  });
});
