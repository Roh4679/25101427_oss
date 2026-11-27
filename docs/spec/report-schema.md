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
  mitigated: boolean;              // 완화 규칙 적용 여부
  confirmed: boolean;              // confirmations 반영 여부
  naReason?: "trigger" | "disabled" | "mode";
  message?: string;                // 통과가 아니면 YAML의 message
  fix?: string;
  principle?: { law: string; article: string; source: string; verified_at: string };
  findings: Finding[];
}

interface Finding {
  location?: { file?: string; line?: number; url?: string };
  message: string;
  fix: string;
  aiPrompt?: string;
  legalBasis?: string;
}
```

생성 시각은 넣지 않는다. 같은 입력이면 같은 JSON이 나와야 한다 (골든 테스트, CI).

## 2. 한국어 표시 이름

| 값 | 표시 |
|---|---|
| `ready` | ✅ 배포 가능 |
| `ready_with_fixes` | ⚠️ 보완 후 배포 권장 |
| `needs_work` | ❌ 보완 필요 |
| `blocked` | ⛔ 배포 차단 |
| `pass` / `partial` / `needs_review` / `fail` / `na` | 통과 / 부분 통과 / 확인 필요 / 실패 / 해당 없음 |
| `security` `privacy` `commerce` `advertising` `accessibility` `ux` | 보안 / 개인정보 / 결제·상거래 / 광고·콘텐츠 / 접근성 / 운영·UX |

## 3. 점수 계산 (src/score)

평가기 출력(`outcome`, `score`, `reasons`)을 다음 순서로 바꾼다.

1. **N/A**: trigger 거짓, `disable`에 있음, live 전용 의무를 정적 모드로 실행 → `na`, 계산에서 제외.
2. **위험도·등급·가중치**: `risk = L×I×P`. 18 이상 critical(10), 12~17 high(5), 6~11 medium(3), 5 이하 low(1). `weightMode: raw`면 가중치 = risk.
3. **상태**

   | outcome | auto | semi |
   |---|---|---|
   | pass | `pass`, 1 | `pass`, 1 |
   | partial | `partial`, s | `needs_review`, s |
   | unknown | `needs_review`, 0.5 | `needs_review`, 0.5 |
   | fail | `fail`, 0 | `needs_review`, 0.5 |

4. **완화 규칙**: grade가 critical이고 상태가 `fail`이며 `reasons`에 `page_missing`이 있고 정적 모드면 → `needs_review`, 0.5, `mitigated: true`. 터미널에 "`--live`로 다시 확인하세요"를 안내한다.
5. **확인 반영**: `confirmations`의 값이 `pass`면 `pass`/1, `fail`이면 `fail`/0, `confirmed: true`.
6. **총점**: `floor(Σ(가중치 × score) / Σ(가중치) × 100)`. 적용 항목이 하나도 없으면 100. 내림을 쓰는 이유: 89.6점이 90점(배포 가능)으로 올라가지 않게 하려고.
7. **차단**: critical이면서 상태가 `fail`인 의무가 하나라도 있으면 `blocked`, 총점 = `min(총점, 59)`.
8. **판정**: 차단이 아니면 90 이상 `ready`, 70~89 `ready_with_fixes`, 70 미만 `needs_work`.
9. **영역 점수**: 같은 식(6)을 영역별로 계산. 상한은 적용하지 않는다.

결과적으로 반자동 항목은 **사람이 `fail`로 확인하기 전에는 차단을 일으키지 않는다.**

## 4. SARIF 대응

`--format sarif`는 SARIF 2.1.0(OASIS 표준)을 따른다.

| SARIF | 리포트 |
|---|---|
| `runs[0].tool.driver.rules[]` | 적용된 의무 (`id`, `shortDescription` = message, `help` = fix) |
| `results[]` | `pass`·`na`가 아닌 Result의 Finding마다 하나 |
| `level` | critical·high → `error`, medium → `warning`, low 또는 `needs_review` → `note` |
| `locations[].physicalLocation` | Finding의 `file`, `line` |
