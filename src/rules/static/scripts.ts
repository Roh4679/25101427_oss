import { attr, findTags, isCodeFile, isHtmlFile, lex, lineIndex } from "../../scanner/source.js";
import type { Detector } from "../../types.js";

// 분석 툴(analytics_scripts)과 외부 임베드(external_embeds) (facts.md 3장). 사실만 모은다.

const ANALYTICS: { vendor: string; code: RegExp; hosts: string[] }[] = [
  { vendor: "ga4", code: /googletagmanager\.com\/gtag\/js\?id=G-|gtag\(\s*['"]config['"]\s*,\s*['"]G-|<GoogleAnalytics\b/, hosts: ["google-analytics.com"] },
  { vendor: "gtm", code: /googletagmanager\.com\/gtm\.js|<GoogleTagManager\b|['"]GTM-[A-Z0-9]+['"]/, hosts: [] },
  { vendor: "meta_pixel", code: /connect\.facebook\.net\/[^'"]*fbevents\.js|fbq\(\s*['"]init/, hosts: ["connect.facebook.net"] },
  { vendor: "mixpanel", code: /cdn\.mxpnl\.com|mixpanel\.init\s*\(/, hosts: ["cdn.mxpnl.com"] },
  { vendor: "kakao_pixel", code: /t1\.daumcdn\.net\/kas\/static\/kp\.js|kakaoPixel\s*\(/, hosts: [] },
  { vendor: "naver_analytics", code: /wcs\.naver\.net\/wcslog\.js/, hosts: ["wcs.naver.net"] },
];
// 분석 툴로 분류된 주소는 외부 임베드에서 뺀다
const ANALYTICS_HOSTS = ["googletagmanager.com", "t1.daumcdn.net", ...ANALYTICS.flatMap((a) => a.hosts)];

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
};
const isAnalyticsHost = (h: string) => ANALYTICS_HOSTS.some((a) => h === a || h.endsWith(`.${a}`));

export const scriptsDetector: Detector = {
  id: "scripts",
  detect(ctx) {
    const analytics: { vendor: string; file: string; line: number }[] = [];
    const embeds: { domain: string; tag: "iframe" | "script"; file: string; line: number }[] = [];
    for (const f of ctx.files) {
      if (f.content === undefined || !(isCodeFile(f.path) || isHtmlFile(f.path))) continue;
      const code = isCodeFile(f.path) ? lex(f.content).code : f.content.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
      const line = lineIndex(f.content);
      for (const a of ANALYTICS) {
        const m = code.match(a.code);
        if (m) analytics.push({ vendor: a.vendor, file: f.path, line: line(m.index ?? 0) });
      }
      for (const t of findTags(code, ["iframe", "script", "Script"])) {
        const src = attr(t.attrs, "src");
        const host = src && /^https?:\/\//i.test(src) ? hostOf(src) : undefined;
        if (!host || isAnalyticsHost(host)) continue;
        embeds.push({ domain: host, tag: t.name === "iframe" ? "iframe" : "script", file: f.path, line: line(t.start) });
      }
    }
    return [
      { key: "analytics_scripts", value: analytics },
      { key: "external_embeds", value: embeds },
    ];
  },
};
