// fixture를 준비해(임시 폴더 + 실제 git) 검사 결과를 보여 준다.
// 사용: npm run demo -- <fixture 이름> [--json]
import { join } from "node:path";
import { renderJson } from "../../src/reporters/json.js";
import { renderTerminal } from "../../src/reporters/terminal.js";
import { scan } from "../../src/scan.js";
import { prepareFixture } from "./prepare.js";

const [name, flag] = process.argv.slice(2);
if (!name) {
  process.stderr.write("사용: npm run demo -- <fixture 이름> [--json]  예: npm run demo -- clean-app\n");
  process.exit(2);
}
const root = prepareFixture(join(import.meta.dirname, "../../fixtures/intentional", name));
const { report, warnings } = scan(root, {}, { network: false, region: "kr" });
for (const w of warnings) process.stderr.write(`경고: ${w}\n`);
process.stderr.write(`준비한 폴더: ${root}\n`);
process.stdout.write(flag === "--json" ? renderJson(report) : renderTerminal(report));
