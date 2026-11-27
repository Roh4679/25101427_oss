import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readGit } from "../../src/adapters/git.js";
import { prepareFixture } from "./prepare.js";

const fixture = (name: string) => join(import.meta.dirname, "../../fixtures/intentional", name);

describe("prepareFixture (실제 git 상태)", () => {
  it("clean-app: .env를 만들고, .gitignore가 무시해 추적되지 않는다 (T73)", () => {
    const root = prepareFixture(fixture("clean-app"));
    expect(readFileSync(join(root, ".env"), "utf8")).toContain("FAKE_TEST");
    const git = readGit(root, [".env", "package.json"])!;
    expect(git.ignored).toEqual([".env"]);
    expect(git.tracked).not.toContain(".env");
    expect(git.tracked).toContain("package.json");
  });

  it("leaky-keys-app: .gitignore가 없어 .env가 커밋된다", () => {
    const root = prepareFixture(fixture("leaky-keys-app"));
    const git = readGit(root, [".env"])!;
    expect(git.tracked).toContain(".env");
    expect(git.ignored).toEqual([]);
  });

  it("정답지·준비 파일은 복사하지 않는다", () => {
    const root = prepareFixture(fixture("clean-app"));
    expect(existsSync(join(root, "expected.json"))).toBe(false);
    expect(existsSync(join(root, "fixture.setup.json"))).toBe(false);
  });
});
