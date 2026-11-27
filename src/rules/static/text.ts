import { extractTexts, isAllTextExcluded } from "../../scanner/text.js";
import type { Detector } from "../../types.js";

// all_text: 사용자에게 보이는 텍스트 전체 (facts.md 4.1). 판단은 하지 않는다.
export const textDetector: Detector = {
  id: "text",
  detect(ctx) {
    const value = ctx.files.filter((f) => !isAllTextExcluded(f.path)).flatMap(extractTexts);
    return [{ key: "all_text", value }];
  },
};
