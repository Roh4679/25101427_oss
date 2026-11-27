import { UserError } from "../../config.js";
import type { Browser, LiveTools } from "./browser.js";

// 렌더링 크롤러 (facts.md 7장 렌더링 규칙). 부수효과(브라우저)는 이 파일에만 둔다.
// 같은 origin만, GET으로 열기만 한다. 폼 제출·로그인 시도·반복 요청은 하지 않는다.

export const MAX_PAGES = 20;
const TIMEOUT_MS = 15_000;
const SKIP_EXT = /\.(?:pdf|zip|png|jpe?g|gif|webp|svg|ico|mp4|mp3|woff2?|css|js|json|xml|txt)$/i;

export interface LivePage {
  url: string; // 요청한 주소
  finalUrl: string;
  status: number; // 0 = 시간 초과·연결 실패
  title: string;
  text: string;
  hasPassword: boolean;
  axe: { id: string; impact: string; nodes: number }[];
  contrast: { selector: string; ratio: number }[];
  forms: { total: number; missing: number };
}

export interface LiveResult {
  startUrl: string;
  pages: LivePage[];
  firstCookies: { name: string; domain: string }[]; // 첫 페이지를 연 직후, 아무것도 누르기 전
}

// 같은 origin의 http(s) 주소만, 해시 없이
export function sameOriginUrl(href: string, base: string, origin: string): string | undefined {
  try {
    const u = new URL(href, base);
    if (!/^https?:$/.test(u.protocol) || u.origin !== origin || SKIP_EXT.test(u.pathname)) return undefined;
    u.hash = "";
    return u.toString();
  } catch {
    return undefined;
  }
}

type Page = Awaited<ReturnType<Browser["newPage"]>>;

// Tab만으로 폼의 모든 입력란과 제출 버튼에 닿는지 (입력하거나 제출하지는 않는다)
async function keyboardForms(page: Page): Promise<{ total: number; missing: number }> {
  const forms = await page.evaluate(() => {
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    let id = 0;
    return [...document.querySelectorAll("form")].slice(0, 5).map((form) => {
      const fields = [...form.querySelectorAll("input:not([type=hidden]), select, textarea, button, [type=submit]")].filter(visible);
      for (const f of fields) f.setAttribute("data-vs-key", String(id++));
      const submit = fields.filter((f) => f.matches("button:not([type=button]):not([type=reset]), input[type=submit]"));
      return { keys: fields.map((f) => f.getAttribute("data-vs-key")!), submitKeys: submit.map((f) => f.getAttribute("data-vs-key")!) };
    });
  });
  if (forms.length === 0) return { total: 0, missing: 0 };
  const focusable = await page.evaluate(() => document.querySelectorAll("a, button, input, select, textarea, [tabindex]").length);
  const reached = new Set<string>();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < Math.min(focusable + 5, 200); i++) {
    await page.keyboard.press("Tab");
    const key = await page.evaluate(() => document.activeElement?.getAttribute("data-vs-key") ?? null);
    if (key) reached.add(key);
  }
  const ok = (f: { keys: string[]; submitKeys: string[] }) => f.submitKeys.length > 0 && f.keys.every((k) => reached.has(k));
  return { total: forms.length, missing: forms.filter((f) => !ok(f)).length };
}

async function visit(tools: LiveTools, page: Page, url: string): Promise<{ page: LivePage; links: string[] }> {
  let status = 0;
  try {
    const res = await page.goto(url, { waitUntil: "load", timeout: TIMEOUT_MS });
    status = res?.status() ?? 0;
  } catch {
    return { page: { url, finalUrl: url, status: 0, title: "", text: "", hasPassword: false, axe: [], contrast: [], forms: { total: 0, missing: 0 } }, links: [] };
  }
  const info = await page.evaluate(() => ({
    title: document.title,
    text: document.body?.innerText ?? "",
    hasPassword: document.querySelector("input[type=password]") !== null,
    links: [...document.querySelectorAll("a[href]")].map((a) => (a as HTMLAnchorElement).href),
  }));
  let axe: LivePage["axe"] = [];
  let contrast: LivePage["contrast"] = [];
  if (status >= 200 && status < 300) {
    const result = await new tools.AxeBuilder({ page }).analyze();
    axe = result.violations.map((v) => ({ id: v.id, impact: v.impact ?? "unknown", nodes: v.nodes.length }));
    contrast = result.violations
      .filter((v) => v.id === "color-contrast")
      .flatMap((v) => v.nodes.map((n) => ({ selector: n.target.join(" "), ratio: Number((n.any[0]?.data as { contrastRatio?: number })?.contrastRatio ?? 0) })));
  }
  const forms = status >= 200 && status < 300 ? await keyboardForms(page) : { total: 0, missing: 0 };
  return { page: { url, finalUrl: page.url(), status, title: info.title, text: info.text, hasPassword: info.hasPassword, axe, contrast, forms }, links: info.links };
}

// startUrl에서 너비 우선으로 같은 origin 페이지를 최대 20개 연다. extra(설정 파일 pages의 같은 origin 주소)는 먼저 넣는다.
export async function crawl(tools: LiveTools, browser: Browser, startUrl: string, extra: string[] = []): Promise<LiveResult> {
  const origin = new URL(startUrl).origin;
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const start = sameOriginUrl(startUrl, startUrl, origin)!;
    const queue = [start, ...extra.flatMap((u) => sameOriginUrl(u, startUrl, origin) ?? [])];
    const seen = new Set(queue);
    const pages: LivePage[] = [];
    let firstCookies: LiveResult["firstCookies"] = [];
    while (queue.length > 0 && pages.length < MAX_PAGES) {
      const url = queue.shift()!;
      const { page: p, links } = await visit(tools, page, url);
      // 시작 페이지가 열리지 않으면 렌더링 결과가 없는 것이다 → 통과로 두지 않고 오류로 멈춘다
      if (pages.length === 0 && !(p.status >= 200 && p.status < 300))
        throw new UserError(`--live 시작 주소를 열 수 없습니다 (${p.status || "연결 실패·시간 초과"}): ${url}`);
      if (pages.length === 0) firstCookies = (await context.cookies()).map((c) => ({ name: c.name, domain: c.domain }));
      pages.push(p);
      for (const href of links) {
        const u = sameOriginUrl(href, p.finalUrl, origin);
        if (u && !seen.has(u)) {
          seen.add(u);
          queue.push(u);
        }
      }
    }
    return { startUrl: start, pages, firstCookies };
  } finally {
    await context.close();
  }
}
