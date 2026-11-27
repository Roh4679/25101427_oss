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
  knowledge: { unverified: string[] };  // 적용된 의무 중 조문 미확인(article = TODO-확인필요)인 id (evidence-dsl.md 9장)
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
  principle?: {
    law: string;
    article: string;                 // 미확인이면 "TODO-확인필요"
    source: string | null;           // 확인한 law.go.kr 주소
    verified_at: string | null;      // 사람이 원문으로 확인한 날짜
    references?: { candidate: string; basis: string; note?: string }[];  // 2차 자료 후보
  };
  technicalReference?: { name: string; item: string }[];
  configPage?: {                   // 설정 파일 pages로 판정한 경우 (evidence-dsl.md 3.5)
    url: string;
    verified: boolean;             // false면 리포트에 "설정으로 지정됨(미검증)"
    httpStatus?: number;           // --live에서 같은 origin을 열었을 때
  };
  findings: Finding[];
}

interface Finding {
  location?: { file?: string; line?: number; url?: string };  // 있어서 문제인 경우 (5장)
  searched?: { routes: number; footer: string[]; texts: number };  // 없어서 문제인 경우 (5장)
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

## 5. 위치 형식

실패의 종류에 따라 위치를 다르게 보여 준다.

| 종류 | 예 | 필드 | 터미널 표시 |
|---|---|---|---|
| **있어서 문제**: 문제가 되는 코드·설정이 존재 | 미리 체크된 선택 동의, 키 노출, alt 없는 이미지, 모호한 버튼 문구 | `location` | `위치: pages/signup.tsx:12, .env` (같은 위치는 한 번, 10곳 넘으면 "외 N곳") |
| **없어서 문제**: 있어야 할 것이 보이지 않음 | 처리방침 없음, 환불 안내 없음, 사업자 정보 없음 | `searched` | `찾아본 곳: 라우트 3개, 푸터 app/layout.tsx, 화면 텍스트 120곳` |

- 어느 쪽인지는 증거 유형이 정한다. `falsy`·`text_absent`·`every`·`none`·`coverage`가 걸린 원소는 **있어서 문제**(`location`), `page_exists`·`page_text_contains`·`text_contains`·`truthy`가 실패한 것은 **없어서 문제**(`searched`).
- `searched.routes`: 확인한 페이지 수 (`pages` 중 `source`가 `footer-link`가 아닌 것). `searched.footer`: 푸터 링크를 찾은 파일 (`footer_links`의 `file`, 중복 제거). `searched.texts`: 흔적을 찾아본 화면 텍스트 조각 수 (`all_text` 원소 수).
- 푸터 파일이 없으면 "푸터 없음"으로 표시한다. `--live`에서는 6단계에서 "렌더링 페이지 N개"를 더한다.

## 6. 터미널 출력 배치

기획서 5.5를 따른다.

1. 머리말: 도구·프로젝트 이름, `종합 점수 N / 100  판정`. 차단이면 `(치명 항목 N개 실패)`를 붙인다.
2. 영역별 점수.
3. **`⛔ 먼저 고칠 것`**: 상태가 `fail`인 치명 항목(`blockers`)을 번호를 붙여 맨 위에 모은다.
4. `확인할 항목`: 나머지 `fail`·`partial`·`needs_review`. 가중치가 큰 것부터, 같으면 지식 베이스 순서.
5. `참고`: 설정으로 지정됨(미검증), 상위 의무를 기다리는 하위 의무.
6. 면책 문구.

항목마다 다음 줄을 쓴다 (값이 없는 줄은 생략).

```
  1. [치명] commerce/refund-policy — 청약철회(환불) 기간·방법 안내가 보이지 않습니다.
     찾아본 곳: 라우트 3개, 푸터 app/layout.tsx, 화면 텍스트 120곳
     해결: …
     근거: 전자상거래법 TODO-확인필요 (확인일 2026-11-27)
     가중치 근거: L3 × I2 × P3 = 18
```

- 등급 표시: critical `[치명]`, high `[높음]`, medium `[보통]`, low `[낮음]`.
- `근거`는 `principle`이 있을 때만: 확인됨이면 `law` `article` (확인일 `verified_at`), 미확인이면 `law` — 조문 확인 전.
- 면책 문구 앞에 `조문 미확인 의무 N개: …`를 쓴다 (`knowledge.unverified`가 비어 있지 않을 때).
- 기획서 5.5의 `→ AI 수정 프롬프트: vibe-signoff fix --rule …` 줄은 `fix` 명령이 생기는 8단계에서 넣는다.
- 사용자에게 보이는 Fact 값(폼 필드 종류, 분석 도구 이름 등)은 `knowledge/kr/labels.yaml`의 표시 이름으로 바꿔 보여 준다 (`evidence-dsl.md` 7장).

