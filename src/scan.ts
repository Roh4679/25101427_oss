import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { collectFiles } from "./scanner/files.js";
import { projectDetector, readPackageJson } from "./scanner/project.js";
import { summarize } from "./score/index.js";
import type { Config } from "./config.js";
import type { Detector, Fact, Report, Result } from "./types.js";

export const DISCLAIMER =
  "이 결과는 자동으로 확인 가능한 항목의 통과 여부이며, 법률 자문이 아니고 법적·보안적 완전성을 보장하지 않습니다.";

const DETECTORS: Detector[] = [projectDetector];

export const TOOL_VERSION = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }
).version;

export interface ScanOptions {
  network: boolean;
  region: "kr" | "global";
}

export interface ScanOutput {
  facts: Fact[];
  report: Report;
}

// 사용자 프로젝트의 코드는 읽기만 하고 실행하지 않는다.
export function scan(root: string, config: Config, options: ScanOptions): ScanOutput {
  const files = collectFiles(root, config.ignorePaths);
  const ctx = { root, files, mode: "static" as const };
  const facts = DETECTORS.flatMap((d) => d.detect(ctx));

  // 3단계: 지식 베이스 로더·평가기가 facts로 results를 만든다.
  const results: Result[] = [];

  const framework = facts.find((f) => f.key === "framework")?.value;
  const report: Report = {
    schemaVersion: 1,
    tool: { name: "vibe-signoff", version: TOOL_VERSION },
    project: { name: readPackageJson(files)?.name ?? basename(root), framework: String(framework ?? "unknown") },
    options: { mode: "static", network: options.network, region: options.region },
    score: summarize(results),
    results,
    disclaimer: DISCLAIMER,
  };
  return { facts, report };
}
