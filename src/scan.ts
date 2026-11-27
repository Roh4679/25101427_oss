import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "./config.js";
import { evaluate } from "./knowledge/evaluate.js";
import { loadKnowledge } from "./knowledge/loader.js";
import { ARTICLE_TODO, type Obligation } from "./knowledge/schema.js";
import { loadLabels, type Labels } from "./knowledge/labels.js";
import { loadServices, type Service } from "./knowledge/services.js";
import { collectFiles } from "./scanner/files.js";
import { projectDetector, readPackageJson } from "./scanner/project.js";
import { servicesDetector } from "./scanner/services.js";
import { routesDetector } from "./scanner/routes/index.js";
import { formsDetector } from "./rules/static/forms.js";
import { imagesDetector } from "./rules/static/images.js";
import { scriptsDetector } from "./rules/static/scripts.js";
import { textDetector } from "./rules/static/text.js";
import { databaseDetector } from "./rules/static/database.js";
import { patternsDetector } from "./rules/static/patterns.js";
import { secretsDetector } from "./rules/static/secrets.js";
import { readGit } from "./adapters/git.js";
import { gitignoreMatcher } from "./scanner/gitignore.js";
import { summarize } from "./score/index.js";
import { buildResults } from "./score/results.js";
import type { Fact, Report, Result } from "./types.js";

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

// 적용된(N/A가 아닌) 의무 중 조문을 사람이 아직 확인하지 않은 것
export const unverifiedArticles = (results: Result[]) =>
  results.filter((r) => r.status !== "na" && r.principle?.article === ARTICLE_TODO).map((r) => r.id);

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
  // git 추적·무시 정보: git이 있으면 git으로, 없으면 .gitignore를 직접 해석한다
  const git = readGit(root, files.map((f) => f.path));
  const ignoredSet = git ? new Set(git.ignored) : undefined;
  const ignored = ignoredSet ? (p: string) => ignoredSet.has(p) : gitignoreMatcher(files);
  const gitFacts: Fact[] = [
    ...(git ? [{ key: "git_tracked", value: git.tracked }] : []),
    { key: "gitignored", value: files.map((f) => f.path).filter(ignored) },
  ];

  const detectors = [
    projectDetector, servicesDetector(kb.services), routesDetector(config), textDetector, formsDetector, scriptsDetector, imagesDetector,
    secretsDetector({ tracked: git?.tracked, ignored }), databaseDetector, patternsDetector,
  ];
  const facts = [...gitFacts, ...detectors.flatMap((d) => d.detect(ctx))];

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
    knowledge: { unverified: unverifiedArticles(results) },
    disclaimer: DISCLAIMER,
  };
  return { facts, report, warnings };
}
