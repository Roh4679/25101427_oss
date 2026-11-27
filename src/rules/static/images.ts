import { attr, findTags, isCodeFile, isHtmlFile, lex, lineIndex } from "../../scanner/source.js";
import type { Detector, Loc } from "../../types.js";

// img_missing_alt (facts.md 5장): <img>, next/image <Image>. alt 속성이 없는 것만 missing (alt=""는 장식 이미지).
// 이미지가 0개면 Fact를 만들지 않는다.
export const imagesDetector: Detector = {
  id: "images",
  detect(ctx) {
    let total = 0;
    const items: Loc[] = [];
    for (const f of ctx.files) {
      if (f.content === undefined || !(isCodeFile(f.path) || isHtmlFile(f.path))) continue;
      const code = isCodeFile(f.path) ? lex(f.content).code : f.content.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
      const line = lineIndex(f.content);
      for (const t of findTags(code, isCodeFile(f.path) ? ["img", "Image"] : ["img"])) {
        total++;
        if (attr(t.attrs, "alt") === undefined) items.push({ file: f.path, line: line(t.start) });
      }
    }
    return total === 0 ? [] : [{ key: "img_missing_alt", value: { total, missing: items.length, items } }];
  },
};
