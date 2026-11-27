import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "./config.js";
import { evaluate } from "./knowledge/evaluate.js";
import { loadKnowledge } from "./knowledge/loader.js";
import type { Obligation } from "./knowledge/schema.js";
import { loadLabels, type Labels } from "./knowledge/labels.js";
import { loadServices, type Service } from "./knowledge/services.js";
import { collectFiles } from "./scanner/files.js";
import { projectDetector, readPackageJson } from "./scanner/project.js";
import { servicesDetector } from "./scanner/services.js";
import { summarize } from "./score/index.js";
import { buildResults } from "./score/results.js";
import type { Fact, Report } from "./types.js";

export const DISCLAIMER =
  "이 결과는 자동으로 확인 가능한 항목의 통과 여부이며, 법률 자문이 아니고 법적·보안적 완전성을 보장하지 않습니다.";

export const TOOL_VERSION = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }
).version;

const KNOWLEDGE_DIR = fileURLToPath(new URL("../knowledge/kr/", import.meta.url));

export interface Knowledge {
  obligations: Obligation[];
  services: Service[];
  labels: Labels;
}

export const loadDefaultKnowledge = (): Knowledge => ({
  obligations: loadKnowledge(KNOWLEDGE_DIR),
  services: loadServices(`${KNOWLEDGE_DIR}services.yaml`),
  labels: loadLabels(`${KNOWLEDGE_DIR}labels.yaml`),
});

export interface ScanOptions {
  network: boolean;
  region: "kr" | "global";
}

export interface ScanOutput {
  facts: Fact[];
  report: Report;
  warnings: string[];
}

// 사실 수집 → 지식 베이스 평가 → 점수. 사용자 프로젝트의 코드는 읽기만 하고 실행하지 않는다.
export function scan(root: string, config: Config, options: ScanOptions, kb: Knowledge = loadDefaultKnowledge()): ScanOutput {
  const mode = "static" as const;
  const files = collectFiles(root, config.ignorePaths);
  const ctx = { root, files, mode };
  const facts = [projectDetector, servicesDetector(kb.services)].flatMap((d) => d.detect(ctx));

  const factMap = new Map(facts.map((f) => [f.key, f.value]));
  const evals = new Map(kb.obligations.map((o) => [o.id, evaluate(o, factMap, mode, kb.labels)]));
  const { results, warnings } = buildResults(kb.obligations, evals, config, mode);

  const report: Report = {
    schemaVersion: 1,
    tool: { name: "vibe-signoff", version: TOOL_VERSION },
    project: { name: readPackageJson(files)?.name ?? basename(root), framework: String(factMap.get("framework") ?? "unknown") },
    options: { mode, network: options.network, region: options.region },
    score: summarize(results),
    results,
    disclaimer: DISCLAIMER,
  };
  return { facts, report, warnings };
}
