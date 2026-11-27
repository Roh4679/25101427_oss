import { describe, expect, it } from "vitest";
import type { Detector, SourceFile } from "../../types.js";
import { formsDetector } from "./forms.js";
import { imagesDetector } from "./images.js";
import { scriptsDetector } from "./scripts.js";

const run = (d: Detector, files: SourceFile[]) =>
  Object.fromEntries(d.detect({ root: "/", files, mode: "static" }).map((f) => [f.key, f.value])) as Record<string, unknown>;
const file = (path: string, content: string): SourceFile => ({ path, content });

describe("forms", () => {
  const signup = file(
    "pages/signup.tsx",
    `export default () => (
<form>
  <label htmlFor="email">이메일</label>
  <input id="email" name="email" type="email" />
  <label htmlFor="b">생년월일</label>
  <input id="b" name="b" type="date" />
  <input name="nickname" />
  <label><input type="checkbox" required /> [필수] 개인정보 수집·이용 동의</label>
  <label><input type="checkbox" onChange={(e) => set(e.target.checked)} defaultChecked /> [선택] 마케팅 수신 동의</label>
</form>);`,
  );

  it("필드 종류(type·name·라벨), 동의 체크박스, 선택 동의 기본 체크 (실패 케이스)", () => {
    const { personal_forms, collects_personal_info } = run(formsDetector, [signup]);
    expect(collects_personal_info).toBe(true);
    expect(personal_forms).toEqual([
      {
        file: "pages/signup.tsx",
        line: 2,
        fields: [
          { name: "email", kind: "email", label: "이메일", file: "pages/signup.tsx", line: 4 },
          { name: "b", kind: "birth", label: "생년월일", file: "pages/signup.tsx", line: 6 },
          { name: "nickname", kind: "other", file: "pages/signup.tsx", line: 7 },
        ],
        consent: { present: true, optional_prechecked: true },
      },
    ]);
  });

  it("통과 케이스: 선택 동의가 기본 체크 아님 (checked={state})", () => {
    const ok = file("a.tsx", `<form><input type="email" name="email" /><label><input type="checkbox" checked={agreed} /> [선택] 마케팅 동의</label></form>`);
    expect(run(formsDetector, [ok]).personal_forms).toMatchObject([{ consent: { present: true, optional_prechecked: false } }]);
  });

  it("개인정보 필드가 없으면 폼이 아니다 (비밀번호·검색어만)", () => {
    const out = run(formsDetector, [file("a.tsx", `<form><input type="password" /><input name="q" /></form>`)]);
    expect(out).toEqual({ personal_forms: [], collects_personal_info: false });
  });

  it("<form> 없는 화면은 파일 전체를 폼으로, 가입 API만 있어도 개인정보 수집", () => {
    expect((run(formsDetector, [file("a.tsx", `<div><input type="tel" name="phone" /></div>`)]).personal_forms as unknown[]).length).toBe(1);
    expect(run(formsDetector, [file("a.ts", "await supabase.auth.signUp({ email, password });")]).collects_personal_info).toBe(true);
    expect(run(formsDetector, [file("a.ts", "// supabase.auth.signUp(...)")]).collects_personal_info).toBe(false);
  });
});

describe("scripts: 분석 툴과 외부 임베드", () => {
  const html = file(
    "index.html",
    `<script src="https://www.googletagmanager.com/gtag/js?id=G-ABC"></script>
<script>fbq('init', '123');</script>
<iframe src="https://www.youtube.com/embed/x"></iframe>
<!-- <iframe src="https://maps.example.com"></iframe> -->
<script src="/local.js"></script>`,
  );

  it("분석 툴 종류와 위치, 분석 툴 주소는 임베드에서 제외", () => {
    const out = run(scriptsDetector, [html]);
    expect(out.analytics_scripts).toEqual([
      { vendor: "ga4", file: "index.html", line: 1 },
      { vendor: "meta_pixel", file: "index.html", line: 2 },
    ]);
    expect(out.external_embeds).toEqual([{ domain: "www.youtube.com", tag: "iframe", file: "index.html", line: 3 }]);
  });

  it("통과 케이스: 아무것도 없으면 빈 배열", () => {
    expect(run(scriptsDetector, [file("a.tsx", "<p>hello</p>")])).toEqual({ analytics_scripts: [], external_embeds: [] });
  });
});

describe("images", () => {
  it("alt 없음만 missing (alt=\"\"는 장식 이미지), 위치 포함", () => {
    const out = run(imagesDetector, [file("a.tsx", `<img src="a" alt="로고" />\n<Image src="b" alt="" />\n<img src="c" />`)]);
    expect(out.img_missing_alt).toEqual({ total: 3, missing: 1, items: [{ file: "a.tsx", line: 3 }] });
  });
  it("이미지가 0개면 Fact를 만들지 않는다", () => {
    expect(run(imagesDetector, [file("a.tsx", "<p>x</p>")])).toEqual({});
  });
});
