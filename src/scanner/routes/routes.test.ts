import { describe, expect, it } from "vitest";
import type { PageRoute, SourceFile } from "../../types.js";
import { nextAppRoute, nextPagesRoute, staticHtmlRoute } from "./file-routes.js";
import { readFooters } from "./footer.js";
import { routesDetector } from "./index.js";

const NEXT_PKG: SourceFile = { path: "package.json", content: JSON.stringify({ dependencies: { next: "14" } }) };
const pagesOf = (files: SourceFile[], pages?: Record<string, string>) =>
  routesDetector({ pages }).detect({ root: "/", files, mode: "static" }).find((f) => f.key === "pages")!.value as PageRoute[];

describe("파일 라우트", () => {
  it.each([
    ["app/page.tsx", "/"],
    ["app/(legal)/privacy/page.tsx", "/privacy"],
    ["src/app/blog/[slug]/page.tsx", "/blog/[slug]"],
    ["app/_private/page.tsx", undefined],
    ["app/@modal/page.tsx", undefined],
    ["app/privacy/layout.tsx", undefined],
  ])("next-app %s → %s", (file, path) => {
    expect(nextAppRoute(file)?.path).toBe(path);
  });

  it.each([
    ["pages/index.tsx", "/"],
    ["pages/terms.tsx", "/terms"],
    ["pages/blog/index.jsx", "/blog"],
    ["pages/_app.tsx", undefined],
    ["pages/api/signup.ts", undefined],
  ])("next-pages %s → %s", (file, path) => {
    expect(nextPagesRoute(file)?.path).toBe(path);
  });

  it.each([
    ["index.html", "/"],
    ["terms.html", "/terms.html"],
    ["public/privacy.html", "/privacy.html"],
    ["docs/a.html", undefined],
  ])("static-html %s → %s", (file, path) => {
    expect(staticHtmlRoute(file)?.path).toBe(path);
  });

  it("next 의존성이 없으면 pages/ 폴더를 라우트로 보지 않는다", () => {
    expect(pagesOf([{ path: "pages/terms.tsx", content: "" }])).toEqual([]);
  });

  it("페이지 제목(<h1>)과 본문 텍스트를 채운다", () => {
    const page = pagesOf([NEXT_PKG, { path: "app/privacy/page.tsx", content: "export default () => <main><h1>개인정보 처리방침</h1><p>처리 목적</p></main>;" }])[0]!;
    expect(page).toMatchObject({ path: "/privacy", title: "개인정보 처리방침" });
    expect(page.text).toContain("처리 목적");
  });
});

describe("푸터", () => {
  const layout: SourceFile = {
    path: "app/layout.tsx",
    content: `export default function L() {
  return (<footer>
    <Link href="/privacy">개인정보 처리방침</Link>
    {/* <a href="/hidden">주석 속 링크</a> */}
    <a href="https://x.notion.site/terms">이용약관</a>
    <a href={url}>동적</a>
    <p>상호: 바이브</p>
  </footer>);
}`,
  };

  it("링크(href, 텍스트, 줄)와 텍스트, 주석 속 링크·동적 href 제외", () => {
    const { links, text } = readFooters([layout]);
    expect(links).toEqual([
      { text: "개인정보 처리방침", href: "/privacy", file: "app/layout.tsx", line: 3 },
      { text: "이용약관", href: "https://x.notion.site/terms", file: "app/layout.tsx", line: 5 },
    ]);
    expect(text).toContain("상호: 바이브");
  });

  it("아는 주소엔 link_text를 붙이고, 외부·모르는 주소는 footer-link로", () => {
    const pages = pagesOf([NEXT_PKG, layout, { path: "app/privacy/page.tsx", content: "<h1>Privacy</h1>" }]);
    expect(pages).toContainEqual(expect.objectContaining({ path: "/privacy", source: "file-route", link_text: "개인정보 처리방침" }));
    expect(pages).toContainEqual({ path: "https://x.notion.site/terms", source: "footer-link", link_text: "이용약관", external: "https://x.notion.site/terms" });
  });
});

describe("설정 파일 pages (우선순위가 가장 높다)", () => {
  it("외부 URL은 config + external, kind를 붙인다", () => {
    expect(pagesOf([], { privacyPolicy: "https://x.notion.site/p" })).toEqual([
      { path: "https://x.notion.site/p", source: "config", kind: "privacy", external: "https://x.notion.site/p" },
    ]);
  });
  it("같은 주소의 정적 라우트가 있으면 본문을 물려받고 source는 config", () => {
    const page = pagesOf([NEXT_PKG, { path: "app/refund/page.tsx", content: "<p>청약철회 안내</p>" }], { refundPolicy: "/refund/" })[0]!;
    expect(page).toMatchObject({ source: "config", kind: "refund", file: "app/refund/page.tsx" });
    expect(page.text).toContain("청약철회");
  });
});
