import type { SourceFile } from "../../types.js";
import { attr, findBlocks, findTags, isCodeFile, isHtmlFile, lex, lineIndex, visibleText } from "../source.js";

// <footer> 안의 링크와 텍스트 (docs/spec/facts.md 2장)

export interface FooterLink {
  text: string;
  href: string;
  file: string;
  line: number;
}

export function readFooters(files: SourceFile[]): { links: FooterLink[]; text: string } {
  const links: FooterLink[] = [];
  const texts: string[] = [];
  for (const f of files) {
    if (f.content === undefined || !(isCodeFile(f.path) || isHtmlFile(f.path))) continue;
    const code = isCodeFile(f.path) ? lex(f.content).code : f.content.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
    const line = lineIndex(f.content);
    for (const footer of findBlocks(code, "footer")) {
      texts.push(visibleText(footer.inner));
      for (const name of ["Link", "a"]) {
        for (const block of findBlocks(footer.inner, name)) {
          const open = findTags(footer.inner.slice(block.start), [name])[0];
          const href = open ? attr(open.attrs, "href") : undefined;
          if (href === undefined || href.startsWith("{")) continue; // 동적 href는 해석하지 않는다
          links.push({ text: visibleText(block.inner), href, file: f.path, line: line(footer.innerStart + block.start) });
        }
      }
    }
  }
  return { links, text: texts.filter(Boolean).join(" | ") };
}
