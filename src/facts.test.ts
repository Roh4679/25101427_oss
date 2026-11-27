import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { FACT_KEYS } from "./facts.js";

it("FACT_KEYS가 docs/spec/facts.md 표와 같다", () => {
  const md = readFileSync(new URL("../docs/spec/facts.md", import.meta.url), "utf8");
  // Fact 표의 행: | `키` | `타입` | 생성 | 설명 | 단계 |
  const documented = [...md.matchAll(/^\| `([a-z_]+)` \| `.*\| \d+ \|\s*$/gm)].map((m) => m[1]);
  expect([...FACT_KEYS].sort()).toEqual([...new Set(documented)].sort());
});
