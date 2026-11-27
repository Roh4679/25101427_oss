import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { scan } from "../../src/scan.js";

// 골든 테스트 비교 규칙: fixtures/README.md
const expectedSchema = z
  .object({
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

for (const dir of fixtureDirs.filter((d) => existsSync(join(d, "expected.json")))) {
  const expected = expectedSchema.parse(JSON.parse(readFileSync(join(dir, "expected.json"), "utf8")));
  if (expected.options.mode === "live") continue; // --live는 6단계

  const { report } = scan(dir, {}, { network: expected.options.network, region: expected.options.region, git: false });
  const actual = new Map(report.results.map((r) => [r.id, r.status]));
  const ids = Object.keys(expected.results);
  const skipped = ids.filter((id) => !actual.has(id));
  const compared = ids.length - skipped.length;

  // 건너뛴 개수를 테스트 이름에 넣어 출력에 항상 보이게 한다.
  describe(`${expected.fixture}: 비교 ${compared}개, 미구현 건너뜀 ${skipped.length}개`, () => {
    it("구현된 의무의 상태가 정답지와 같다", () => {
      for (const id of ids) {
        if (actual.has(id)) expect({ id, status: actual.get(id) }).toEqual({ id, status: expected.results[id] });
      }
    });

    it("지식 베이스에 있는 의무는 모두 정답지에 있다", () => {
      const missing = [...actual.keys()].filter((id) => !(id in expected.results));
      expect(missing, "정답지 갱신 필요 → 사용자에게 묻기").toEqual([]);
    });

    it.skipIf(skipped.length > 0)(`판정·차단·점수 (건너뛴 의무가 없을 때만)`, () => {
      expect(report.score.verdict).toBe(expected.verdict);
      if (expected.blockers) expect([...report.score.blockers].sort()).toEqual([...expected.blockers].sort());
      if (expected.score !== undefined) expect(report.score.total).toBe(expected.score);
    });
  });
}

it("확정된 정답지가 하나 이상 있다", () => {
  expect(fixtureDirs.some((d) => existsSync(join(d, "expected.json")))).toBe(true);
});
