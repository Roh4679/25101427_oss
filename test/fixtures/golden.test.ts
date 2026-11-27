import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { scan } from "../../src/scan.js";

// 골든 테스트 비교 규칙: fixtures/README.md
const expectedSchema = z
  .object({
    $comment: z.string().optional(),
    fixture: z.string(),
    options: z.object({ mode: z.enum(["static", "live"]), network: z.boolean(), region: z.enum(["kr", "global"]) }),
    results: z.record(z.string(), z.enum(["pass", "partial", "needs_review", "fail", "na"])),
    verdict: z.enum(["ready", "ready_with_fixes", "needs_work", "blocked"]),
    blockers: z.array(z.string()).optional(),
    score: z.number().int().optional(),
  })
  .strict();

const ROOT = join(import.meta.dirname, "../../fixtures");
const fixtureDirs = ["intentional", "natural"].flatMap((group) => {
  const dir = join(ROOT, group);
  return existsSync(dir) ? readdirSync(dir).map((name) => join(dir, name)) : [];
});

describe.each(fixtureDirs.filter((d) => existsSync(join(d, "expected.json"))))("%s", (dir) => {
  const expected = expectedSchema.parse(JSON.parse(readFileSync(join(dir, "expected.json"), "utf8")));

  it("정답지와 같다", () => {
    if (expected.options.mode === "live") return; // --live는 6단계
    const { report } = scan(dir, {}, { network: expected.options.network, region: expected.options.region });
    const actual = new Map(report.results.map((r) => [r.id, r.status]));

    const skipped = Object.keys(expected.results).filter((id) => !actual.has(id));
    for (const [id, status] of Object.entries(expected.results)) {
      if (actual.has(id)) expect({ id, status: actual.get(id) }).toEqual({ id, status });
    }
    const missing = [...actual.keys()].filter((id) => !(id in expected.results));
    expect(missing, "지식 베이스에 있지만 정답지에 없는 의무 (정답지 갱신 필요 → 사용자에게 묻기)").toEqual([]);

    if (skipped.length === 0) {
      expect(report.score.verdict).toBe(expected.verdict);
      if (expected.blockers) expect([...report.score.blockers].sort()).toEqual([...expected.blockers].sort());
      if (expected.score !== undefined) expect(report.score.total).toBe(expected.score);
    } else {
      console.info(`${expected.fixture}: 미구현 의무 ${skipped.length}개 건너뜀`);
    }
  });
});

it("확정된 정답지가 하나 이상 있다", () => {
  expect(fixtureDirs.some((d) => existsSync(join(d, "expected.json")))).toBe(true);
});
