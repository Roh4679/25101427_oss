import type { Config } from "../../config.js";
import type { Detector, PageRoute } from "../../types.js";
import { readPackageJson } from "../project.js";
import { extractTexts } from "../text.js";
import { visibleText } from "../source.js";
import { fileRoutes } from "./file-routes.js";
import { readFooters } from "./footer.js";

// 페이지 목록 병합: 설정 파일 > (--live, 6단계) > 정적 라우트 해석 > 푸터 링크 (기획서 6.8)

const KIND_OF: Record<string, PageRoute["kind"]> = { privacyPolicy: "privacy", terms: "terms", refundPolicy: "refund" };
const isExternal = (href: string) => /^https?:\/\//i.test(href);
const samePath = (a: string, b: string) => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

export function configRoutes(pages: Config["pages"]): PageRoute[] {
  return Object.entries(pages ?? {}).map(([key, value]) => ({
    path: value!,
    source: "config" as const,
    kind: KIND_OF[key],
    ...(isExternal(value!) ? { external: value! } : {}),
  }));
}

// 설정 페이지 주소가 --live로 연 주소와 같은지 (상대 경로는 시작 주소 기준)
const sameUrl = (configPath: string, livePath: string) => samePath(configPath.replace(/^https?:\/\/[^/]+/i, ""), livePath);

export function routesDetector(config: Config = {}, live: PageRoute[] = [], liveOrigin?: string): Detector {
  return {
    id: "routes",
    detect(ctx) {
      const pkg = readPackageJson(ctx.files);
      const deps = [...Object.keys(pkg?.dependencies ?? {}), ...Object.keys(pkg?.devDependencies ?? {})];
      const byPath = new Map(ctx.files.map((f) => [f.path, f]));

      // 정적 라우트: 페이지 파일의 제목(<h1>·<title>)과 본문 텍스트를 채운다
      const pages: PageRoute[] = fileRoutes(ctx.files, deps).map((r) => {
        const f = byPath.get(r.file!)!;
        const pieces = extractTexts(f);
        const h1 = f.content?.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>|<title\b[^>]*>([\s\S]*?)<\/title>/);
        const title = h1 ? visibleText(h1[1] ?? h1[2] ?? "") : undefined;
        return { ...r, ...(title ? { title } : {}), ...(pieces.length > 0 ? { text: pieces.map((p) => p.text).join("\n") } : {}) };
      });

      // --live로 연 페이지: 같은 주소의 정적 라우트와 합친다 (우선순위 live > 정적).
      // 2xx로 실제 열린 페이지만 "있음"이다. 404·로그인 리다이렉트 등은 설정 페이지 판정에만 쓴다.
      const opened2xx = (l: PageRoute) => (l.http_status ?? 0) >= 200 && (l.http_status ?? 0) < 300 && !l.login_redirect && !l.same_as_start;
      for (const l of live.filter(opened2xx)) {
        const i = pages.findIndex((p) => samePath(p.path, l.path));
        if (i >= 0) pages[i] = { ...pages[i]!, ...l };
        else pages.push(l);
      }

      // 설정 파일 지정: 같은 주소의 정적 라우트가 있으면 본문을 물려받고 설정이 이긴다.
      // 같은 origin이면 --live 응답(http_status 등)을 붙인다. 다른 origin은 열지 않는다.
      for (const c of configRoutes(config.pages)) {
        const sameOrigin = !c.external || (liveOrigin !== undefined && c.external.startsWith(liveOrigin));
        const opened = sameOrigin ? live.find((l) => sameUrl(c.path, l.path)) : undefined;
        if (opened)
          Object.assign(c, {
            http_status: opened.http_status,
            final_url: opened.final_url,
            login_redirect: opened.login_redirect,
            ...(opened.same_as_start ? { same_as_start: true } : {}),
            ...(opened.text ? { text: opened.text } : {}),
          });
        const i = pages.findIndex((p) => samePath(p.path, c.path));
        if (i >= 0) pages[i] = { ...pages[i]!, ...c };
        else pages.push(c);
      }

      // 푸터 링크: 아는 주소면 링크 텍스트만 붙이고, 모르는 주소·외부 링크는 footer-link로 더한다
      const footer = readFooters(ctx.files);
      for (const l of footer.links) {
        const hit = pages.find((p) => samePath(p.path, l.href));
        if (hit) hit.link_text ??= l.text;
        else pages.push({ path: l.href, source: "footer-link", link_text: l.text, ...(isExternal(l.href) ? { external: l.href } : {}) });
      }

      return [
        { key: "pages", value: pages },
        { key: "footer_links", value: footer.links },
        { key: "footer_text", value: footer.text },
      ];
    },
  };
}
