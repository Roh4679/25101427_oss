# 리포트 명세

모든 리포터(terminal, markdown, html, sarif, ai-prompt)는 이 JSON 하나를 입력으로 받는다. `--format json`은 이것을 그대로 출력한다.

## 1. 구조

```ts
interface Report {
  schemaVersion: 1;
  tool: { name: "vibe-signoff"; version: string };
  project: { name: string; framework: string };
  options: { mode: "static" | "live"; liveUrl?: string; network: boolean; region: "kr" | "global" };
  score: {
    total: number;                 // 0~100 정수
    verdict: Verdict;
    blockers: string[];            // 차단을 일으킨 의무 id
    categories: Record<Category, number | null>;  // 적용 항목이 없으면 null
  };
  results: Result[];               // 지식 베이스 순서대로, N/A 포함
  checklist?: ChecklistAnswer[];   // checklist 명령 결과가 있으면 첨부
  disclaimer: string;
}

type Verdict = "ready" | "ready_with_fixes" | "needs_work" | "blocked";
type Category = "security" | "privacy" | "commerce" | "advertising" | "accessibility" | "ux";
type Status = "pass" | "partial" | "needs_review" | "fail" | "na";

interface Result {
  id: string;
  category: Category;
  check: "auto" | "semi";
  status: Status;
  score: number | null;            // na면 null
  factors: { L: number; I: number; P: number };
  risk: number;                    // L×I×P
  grade: "critical" | "high" | "medium" | "low";
  weight: number;
  mitigated: boolean;              // 치명 항목이지만 근거가 불확실해 차단하지 않음 (scoring.md 3장)
  confirmed: boolean;              // confirmations 반영 여부
  naReason?: "trigger" | "disabled" | "mode" | "dependency";  // dependency: 상위 의무(depends_on)가 pass가 아님
  message?: string;                // 통과가 아니면 YAML의 message
  fix?: string;
  principle?: { law: string; article: string; source: string; verified_at: string };
  configPage?: {                   // 설정 파일 pages로 판정한 경우 (evidence-dsl.md 3.5)
    url: string;
    verified: boolean;             // false면 리포트에 "설정으로 지정됨(미검증)"
    httpStatus?: number;           // --live에서 같은 origin을 열었을 때
  };
  findings: Finding[];
}

interface Finding {
  location?: { file?: string; line?: number; url?: string };
  message: string;
  fix: string;
  aiPrompt?: string;
  legalBasis?: string;
  policyTodo?: { from: string; item: string }[];  // 상위 의무 fail 시 하위 의무의 parent_hint (evidence-dsl.md 3.4)
}
```

`policyTodo`는 리포트에 "새로 만들 처리방침에 포함할 항목" 목록으로 보인다. `from`은 하위 의무 id, `item`은 채워진 `parent_hint` 문구다. 점수에는 영향이 없다.

생성 시각은 넣지 않는다. 같은 입력이면 같은 JSON이 나와야 한다 (골든 테스트, CI).

## 2. 한국어 표시 이름

| 값 | 표시 |
|---|---|
| `ready` | ✅ 배포 가능 |
| `ready_with_fixes` | ⚠️ 보완 후 배포 권장 |
| `needs_work` | ❌ 보완 필요 |
| `blocked` | ⛔ 배포 차단 |
| `pass` / `partial` / `needs_review` / `fail` / `na` | 통과 / 부분 통과 / 확인 필요 / 실패 / 해당 없음 |
### 영역 (`category` ↔ 리포트 영역명)

리포트에 보이는 영역명은 아래 6개뿐이다. 코드·JSON·YAML에서는 왼쪽 값만 쓴다.

| `category` | 리포트 영역명 | 포함 의무 (1차) |
|---|---|---|
| `security` | 보안 | `security/*` |
| `privacy` | 개인정보 | `privacy/*` |
| `commerce` | 결제·상거래 | `commerce/*` |
| `advertising` | 광고·콘텐츠 | `advertising/*` |
| `accessibility` | 접근성 | `accessibility/*` |
| `ux` | 운영·UX | `ux/button-labels`, `legal/terms-page` |

의무 id의 접두어(`legal/`)와 `category`는 다를 수 있다. 영역 집계는 항상 YAML의 `category` 값을 따른다.

## 3. 점수 계산

[docs/scoring.md](../scoring.md)를 따른다. 상태 변환, 치명 항목의 확실성 기준, 내림, 차단 상한, 영역 점수는 모두 그 문서에만 적는다.

`Result`에는 `certain`을 넣지 않는다. 불확실해서 차단하지 않은 치명 항목은 `mitigated: true`로 표시하고, 터미널에 "`--live`로 다시 확인하거나 `confirmations`에 확인 결과를 적으세요"를 안내한다.

## 4. SARIF 대응

`--format sarif`는 SARIF 2.1.0(OASIS 표준)을 따른다.

| SARIF | 리포트 |
|---|---|
| `runs[0].tool.driver.rules[]` | 적용된 의무 (`id`, `shortDescription` = message, `help` = fix) |
| `results[]` | `pass`·`na`가 아닌 Result의 Finding마다 하나 |
| `level` | critical·high → `error`, medium → `warning`, low 또는 `needs_review` → `note` |
| `locations[].physicalLocation` | Finding의 `file`, `line` |
