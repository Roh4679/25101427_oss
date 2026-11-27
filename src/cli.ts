#!/usr/bin/env node
import { existsSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Command, CommanderError, Option } from "commander";
import { loadConfig, UserError } from "./config.js";
import { renderJson } from "./reporters/json.js";
import { renderTerminal } from "./reporters/terminal.js";
import { scan, TOOL_VERSION } from "./scan.js";
import { exitCodeOf } from "./score/index.js";

interface ScanFlags {
  live?: string;
  network: boolean;
  ai?: boolean;
  region?: "kr" | "global";
  format: "terminal" | "json" | "markdown" | "html" | "sarif";
  output?: string;
  config?: string;
}

// 명세(docs/spec/cli.md)에 있지만 뒤 단계에서 구현하는 옵션
function rejectUnimplemented(flags: ScanFlags) {
  if (flags.live) throw new UserError("--live는 아직 지원하지 않습니다 (6단계에서 추가 예정).");
  if (flags.ai) throw new UserError("--ai는 아직 지원하지 않습니다.");
  if (!["terminal", "json"].includes(flags.format))
    throw new UserError(`--format ${flags.format}은 아직 지원하지 않습니다 (8단계에서 추가 예정). terminal 또는 json을 쓰세요.`);
}

function runScan(dirArg: string | undefined, flags: ScanFlags): number {
  rejectUnimplemented(flags);
  const root = resolve(dirArg ?? ".");
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new UserError(`폴더가 없습니다: ${root}`);

  const config = loadConfig(flags.config ? resolve(flags.config) : join(root, "signoff.config.json"), Boolean(flags.config));
  const { report } = scan(root, config, {
    network: flags.network,
    region: flags.region ?? config.region ?? "kr",
  });

  const text = flags.format === "json" ? renderJson(report) : renderTerminal(report);
  if (flags.output) writeFileSync(flags.output, text);
  else process.stdout.write(text);
  return exitCodeOf(report.score.verdict);
}

const program = new Command()
  .name("vibe-signoff")
  .description("바이브코딩으로 만든 웹 서비스를 배포 전에 점검합니다")
  .version(TOOL_VERSION)
  .exitOverride()
  .configureOutput({ outputError: (str, write) => write(`명령줄 오류: ${str}`) });

program
  .command("scan")
  .description("프로젝트를 검사하고 점수와 판정을 출력합니다")
  .argument("[dir]", "검사할 폴더 (기본: 현재 폴더)")
  .option("--live <url>", "렌더링 검사할 URL")
  .option("--no-network", "OSV 조회 등 외부 요청을 끕니다")
  .option("--ai", "LLM 의미 검사를 켭니다")
  .addOption(new Option("--region <region>", "지역 기준").choices(["kr", "global"]))
  .addOption(new Option("--format <format>", "리포트 형식").choices(["terminal", "json", "markdown", "html", "sarif"]).default("terminal"))
  .option("--output <file>", "리포트 저장 경로")
  .option("--config <file>", "설정 파일 (기본: <dir>/signoff.config.json)")
  .action((dir: string | undefined, flags: ScanFlags) => {
    process.exitCode = runScan(dir, flags);
  });

try {
  program.parse();
} catch (err) {
  if (err instanceof CommanderError) {
    // 도움말·버전 출력은 정상 종료
    process.exitCode = err.code === "commander.helpDisplayed" || err.code === "commander.version" || err.code === "commander.help" ? 0 : 2;
  } else if (err instanceof UserError) {
    process.stderr.write(`오류: ${err.message}\n`);
    process.exitCode = 2;
  } else {
    process.stderr.write(`예상하지 못한 오류: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exitCode = 2;
  }
}
