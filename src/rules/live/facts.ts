import type { PageRoute } from "../../types.js";
import type { LiveResult } from "./crawl.js";

// 크롤 결과 → Fact (facts.md 7장). 순수 함수.

export interface LiveFacts {
  pages: PageRoute[]; // source: "live"
  texts: { text: string; source: "live"; url: string }[]; // all_text에 더할 조각
  facts: { key: string; value: unknown }[];
}

const pathOf = (url: string) => {
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
};

export function liveFacts(live: LiveResult, isTracking: (name: string) => boolean): LiveFacts {
  const startText = live.pages[0]?.text.trim();
  const isFallback = (p: LiveResult["pages"][number], i: number) => i > 0 && Boolean(startText) && p.text.trim() === startText;
  // SPA 기본 화면(시작 페이지와 같은 본문)은 같은 폼·문제를 두 번 세지 않도록 뺀다
  const ok = live.pages.filter((p, i) => p.status >= 200 && p.status < 300 && !isFallback(p, i));
  const pages: PageRoute[] = live.pages.map((p, i) => ({
    path: pathOf(p.url),
    source: "live",
    ...(p.title ? { title: p.title } : {}),
    ...(p.text ? { text: p.text } : {}),
    http_status: p.status,
    final_url: p.finalUrl,
    login_redirect: new URL(p.finalUrl).pathname !== new URL(p.url).pathname && p.hasPassword,
    ...(isFallback(p, i) ? { same_as_start: true } : {}),
  }));
  const texts = ok.flatMap((p) => (p.text.trim() ? [{ text: p.text, source: "live" as const, url: p.url }] : []));

  const formTotal = ok.reduce((s, p) => s + p.forms.total, 0);
  const facts = [
    { key: "cookies_before_consent", value: live.firstCookies.filter((c) => isTracking(c.name)).map((c) => ({ ...c, url: live.startUrl })) },
    { key: "axe_violations", value: ok.flatMap((p) => p.axe.map((v) => ({ ...v, url: p.url }))) },
    { key: "contrast_failures", value: ok.flatMap((p) => p.contrast.map((c) => ({ ...c, url: p.url }))) },
    ...(formTotal > 0
      ? [
          {
            key: "keyboard_forms",
            value: {
              total: formTotal,
              missing: ok.reduce((s, p) => s + p.forms.missing, 0),
              items: ok.filter((p) => p.forms.missing > 0).map((p) => ({ url: p.url })),
            },
          },
        ]
      : []),
  ];
  return { pages, texts, facts };
}
