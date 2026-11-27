import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UserError } from "../../config.js";
import { cookieMatcher, loadServices } from "../../knowledge/services.js";
import { scan } from "../../scan.js";
import type { Result } from "../../types.js";
import { startOtherOrigin, startSite, type TestSite } from "../../../test/live-site/server.js";
import { type Browser, INSTALL_HINT, launchBrowser, loadLiveTools, type LiveTools } from "./browser.js";
import { crawl, MAX_PAGES, sameOriginUrl, type LiveResult } from "./crawl.js";
import { liveFacts } from "./facts.js";

const SITE_DIR = join(import.meta.dirname, "../../../test/live-site");
const TRACKING = cookieMatcher(loadServices(join(import.meta.dirname, "../../../knowledge/kr/services.yaml")).tracking_cookies);

describe("sameOriginUrl", () => {
  const o = "http://a.test";
  it.each([
    ["/x#top", "http://a.test/x"],
    ["http://b.test/x", undefined],
    ["mailto:a@b.c", undefined],
    ["/file.pdf", undefined],
    ["../y?q=1", "http://a.test/y?q=1"],
  ])("%s → %s", (href, out) => expect(sameOriginUrl(href, "http://a.test/p/", o)).toBe(out));
});

describe("liveFacts (순수 함수)", () => {
  const page = (url: string, over: Partial<LiveResult["pages"][number]> = {}) => ({
    url, finalUrl: url, status: 200, title: "t", text: "본문", hasPassword: false, axe: [], contrast: [], forms: { total: 0, missing: 0 }, ...over,
  });
  it("추적 쿠키만 남기고, 로그인 리다이렉트를 표시한다", () => {
    const out = liveFacts(
      {
        startUrl: "http://a.test/",
        pages: [page("http://a.test/"), page("http://a.test/members", { finalUrl: "http://a.test/login", hasPassword: true })],
        firstCookies: [{ name: "_ga", domain: "a.test" }, { name: "_ga_ABC", domain: "a.test" }, { name: "theme", domain: "a.test" }],
      },
      TRACKING,
    );
    expect(out.facts.find((f) => f.key === "cookies_before_consent")!.value).toEqual([
      { name: "_ga", domain: "a.test", url: "http://a.test/" },
      { name: "_ga_ABC", domain: "a.test", url: "http://a.test/" },
    ]);
    expect(out.pages[1]).toMatchObject({ path: "/members", source: "live", login_redirect: true });
  });
  it("폼이 없으면 keyboard_forms Fact를 만들지 않는다", () => {
    const out = liveFacts({ startUrl: "http://a.test/", pages: [page("http://a.test/")], firstCookies: [] }, TRACKING);
    expect(out.facts.map((f) => f.key)).not.toContain("keyboard_forms");
  });
});

it("T107 playwright가 없으면 설치 안내 (종료 코드 2용 UserError)", async () => {
  await expect(loadLiveTools(() => Promise.reject(new Error("Cannot find module")))).rejects.toThrow(new UserError(INSTALL_HINT));
});

// 실제 브라우저 테스트: Playwright Chromium → Chrome → Edge 중 하나가 있어야 한다
let tools: LiveTools | undefined;
let browser: Browser | undefined;
try {
  tools = await loadLiveTools();
  browser = await launchBrowser(tools);
} catch {
  console.warn("렌더링 테스트를 건너뜁니다: playwright 또는 브라우저가 없습니다.");
}

describe.skipIf(!browser)("렌더링 크롤 (실제 브라우저)", () => {
  let site: TestSite;
  let other: TestSite;
  let live: LiveResult;

  beforeAll(async () => {
    other = await startOtherOrigin();
    site = await startSite(other.url);
    live = await crawl(tools!, browser!, `${site.url}/`, ["/gone", "/members", "/spa/terms"]);
  }, 120_000);
  afterAll(async () => {
    await site?.close();
    await other?.close();
    await browser?.close();
  });

  it("T102 동의 전 추적 쿠키, T103 대비 부족, T104 키보드 폼 1/2", () => {
    const { facts } = liveFacts(live, TRACKING);
    const get = (k: string) => facts.find((f) => f.key === k)?.value;
    expect(get("cookies_before_consent")).toEqual([expect.objectContaining({ name: "_ga" })]);
    expect((get("contrast_failures") as unknown[]).length).toBeGreaterThan(0);
    expect(live.pages[0]!.forms).toEqual({ total: 2, missing: 1 }); // 시작 페이지: 좋은 폼 1, tabindex=-1 폼 1
    expect(get("keyboard_forms")).toMatchObject({ items: expect.arrayContaining([{ url: `${site.url}/` }]) });
  });

  it("T105 다른 origin은 열지 않는다, 같은 origin 링크는 따라간다", () => {
    expect(other.requests).toEqual([]);
    expect(live.pages.map((p) => new URL(p.url).pathname)).toEqual(expect.arrayContaining(["/", "/terms.html", "/dynamic-refund"]));
  });

  it("설정 페이지 응답: 404, 로그인 리다이렉트, SPA 200", () => {
    const by = (p: string) => live.pages.find((x) => new URL(x.url).pathname === p)!;
    expect(by("/gone").status).toBe(404);
    expect(by("/members")).toMatchObject({ status: 200, hasPassword: true });
    expect(new URL(by("/members").finalUrl).pathname).toBe("/login.html");
    expect(by("/spa/terms").status).toBe(200);
  });

  it("T109 시작 페이지가 열리지 않으면(404·연결 실패) 오류 — 렌더링 항목을 통과로 두지 않는다", async () => {
    await expect(crawl(tools!, browser!, `${site.url}/gone`)).rejects.toThrow(UserError);
    await expect(crawl(tools!, browser!, "http://127.0.0.1:9/")).rejects.toThrow(/열 수 없습니다/);
  }, 120_000);

  it("T106 최대 20페이지", async () => {
    const many = await crawl(tools!, browser!, `${site.url}/many`);
    expect(many.pages.length).toBe(MAX_PAGES);
  }, 120_000);

  describe("scan --live (실제 지식 베이스)", () => {
    const status = (r: Result[], id: string) => r.find((x) => x.id === id)!;
    const run = (pages: Record<string, string>) => scan(SITE_DIR, { pages }, { network: false, region: "kr" }, undefined, live).report;

    it("렌더링 의무 4개가 평가된다 (정적이면 N/A, T101)", () => {
      const r = run({}).results;
      expect(status(r, "privacy/cookie-before-consent")).toMatchObject({ status: "fail", grade: "high" });
      expect(status(r, "accessibility/color-contrast").status).toBe("fail");
      expect(status(r, "accessibility/keyboard-form").status).toBe("partial");
      expect(status(r, "accessibility/axe-summary").status).toBe("needs_review");
      const staticReport = scan(SITE_DIR, {}, { network: false, region: "kr" }).report;
      expect(status(staticReport.results, "privacy/cookie-before-consent")).toMatchObject({ status: "na", naReason: "mode" });
    });

    it("T48 설정 페이지가 404 → 확실한 실패", () => {
      const r = status(run({ terms: "/gone" }).results, "ux/terms-page");
      expect(r).toMatchObject({ status: "fail", findings: [{ message: "설정에 지정한 페이지가 없습니다 (404)" }] });
    });
    it("T50b 로그인 리다이렉트 → 확인 필요", () => {
      const r = status(run({ terms: "/members" }).results, "ux/terms-page");
      expect(r).toMatchObject({ status: "needs_review", findings: [{ message: "로그인이 필요한 페이지라 확인하지 못했습니다" }] });
    });
    it("T49a SPA 기본 화면(시작 페이지와 같은 본문, 푸터에 '이용약관' 링크) → 흔적이 있어도 확인 필요", () => {
      const r = status(run({ terms: "/spa/terms" }).results, "ux/terms-page");
      expect(r).toMatchObject({ status: "needs_review", findings: [{ message: "설정에 지정한 페이지가 열렸지만 해당 내용이 보이지 않습니다" }] });
    });
    it("T49 200 + 본문에 흔적 → 통과, 확인됨", () => {
      const r = status(run({ terms: "/terms.html" }).results, "ux/terms-page");
      expect(r).toMatchObject({ status: "pass", configPage: { verified: true, httpStatus: 200 } });
    });
    it("T108 렌더링에만 있는 문구도 all_text에 들어간다", () => {
      const { facts } = scan(SITE_DIR, {}, { network: false, region: "kr" }, undefined, live);
      const texts = (facts.find((f) => f.key === "all_text")!.value as { text: string; source: string }[]).filter((t) => t.source === "live");
      expect(texts.some((t) => t.text.includes("청약철회"))).toBe(true);
    });
  });
});
