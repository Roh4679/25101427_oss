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

export function routesDetector(config: Config = {}): Detector {
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

      // 설정 파일 지정: 같은 주소의 정적 라우트가 있으면 본문을 물려받고 설정이 이긴다
      for (const c of configRoutes(config.pages)) {
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
