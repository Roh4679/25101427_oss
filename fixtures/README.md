# fixtures

| 폴더 | 만드는 주체 | 정답 작성 |
|---|---|---|
| `intentional/` | Claude Code | 사용자 (`expected.draft.json` → 검토 → `expected.json`) |
| `natural/` | 다른 AI 코딩 도구로 평범하게 만든 앱 (**코드 수정 금지**) | 사용자 |

## 의도적 가짜 키

`fixtures/`의 `.env`와 소스에 있는 키는 **탐지 규칙을 시험하려고 일부러 넣은 가짜 값**이다.

- 값에 모두 `FAKE_TEST`(그리고 `DO_NOT_USE`)가 들어 있다. 실제 키가 아니며 어떤 서비스에서도 동작하지 않는다.
- 위치는 두 곳뿐이다: `fixture.setup.json`(준비할 때 만드는 `.env` 내용), `leaky-keys-app/src/main.js`(하드코딩 탐지용).
- 접두어(`sk-proj-` 등)와 길이는 vibe-signoff의 탐지 규칙에 걸리도록 맞췄다. 실제 서비스 키와 헷갈리지 않도록 본문은 사람이 읽을 수 있는 단어로 쓴다.
- 저장소 최상위 `.gitleaks.toml`은 위 두 곳만 예외로 둔다. 다른 비밀값 검사 도구가 이 파일들을 잡으면 같은 이유로 예외 처리한다.
- `fixtures/` 밖에는 가짜 키도 두지 않는다. 단위 테스트의 키 문자열은 테스트 안에서 조립한다.

## fixture 준비

골든 테스트와 데모(`npm run demo -- <이름>`)는 같은 준비 함수(`test/fixtures/prepare.ts`)를 쓴다.

1. fixture 폴더를 임시 폴더에 복사한다 (`expected.json`, `fixture.setup.json` 제외).
2. `fixture.setup.json`의 `files`(예: `.env`)를 만든다. `.env`는 저장소에 두지 않는다.
3. `git init` → `git add -A`(그 fixture의 `.gitignore`를 따른다) → `git commit`.

그래서 `.gitignore`가 `.env`를 무시하는 앱은 `.env`가 추적되지 않고, `.gitignore`가 없는 앱은 `.env`가 커밋된다. vibe-signoff 저장소 자체의 git 정보는 판정에 쓰지 않는다.

```json
{ "files": { ".env": "SUPABASE_SERVICE_ROLE_KEY=FAKE_TEST_..." } }
```

## 정답지 형식

```jsonc
{
  "fixture": "signup-app",
  "options": { "mode": "static", "network": false, "region": "kr" },  // 골든 테스트 실행 조건
  "results": { "<의무 id>": "pass | partial | needs_review | fail | na" },
  "verdict": "ready | ready_with_fixes | needs_work | blocked",
  "blockers": ["<의무 id>"],   // 선택
  "score": 58                  // 선택
}
```

## 골든 테스트 비교 규칙 (`npm run test:fixtures`)

1. `expected.json`이 있는 폴더만 실행한다. `expected.draft.json`만 있으면 건너뛴다.
2. `results`의 의무 중 **지식 베이스에 아직 없는 의무는 "미구현"으로 건너뛰고** 개수를 출력한다. 있는 의무는 상태가 정확히 같아야 한다.
3. 지식 베이스에 있는데 `results`에 없는 의무는 실패로 본다 (정답지 갱신 필요 → 사용자에게 묻는다).
4. `verdict`, `blockers`, `score`는 건너뛴 의무가 **하나도 없을 때만** 비교한다.
5. 실패하면 정답지가 아니라 코드를 고친다.
6. fixture는 **준비한 뒤** 검사한다 (아래 "fixture 준비"). 실제 git 상태로 판정한다.

## 초안 점수 계산 근거

규칙은 [docs/scoring.md](../docs/scoring.md). 가중치: critical 10, high 5, medium 3, low 1. `floor(Σ가중치×점수 / Σ가중치 × 100)`.

- **clean-app**: 적용 14개 모두 통과 → 100, `ready`
- **signup-app**: 적용 9개 (처리방침 필수 항목·분석 툴 고지·쿠키는 처리방침이 `pass`가 아니라 `na`). 분자 = SEC-01 10 + SEC-03 5 + 처리방침 0 + 동의 체크박스 0 + 최소 수집 5×0.5 + 약관 3 + 광고 문구 5 + alt 3 + 버튼 1 = 29.5, 분모 52 → 56.7 → **56**. 처리방침(흔적 없음 → 확실한 실패)과 동의 체크박스 실패 → `blocked`
- **leaky-keys-app**: 적용 6개. 분자 = 키 노출 0 + 위험 패턴 5 + 약관 3 + 광고 문구 5 + alt 3×0.5 + 버튼 1×0.5 = 15, 분모 27 → 55.5 → **55**. 키 노출(critical) 실패 → `blocked`
- **consent-label-app**: 적용 8개 (처리방침 필수 항목은 `depends_on`으로 `na`). 분자 = SEC-01 10 + SEC-03 5 + 처리방침 0 + 동의 체크박스 10 + 최소 수집 5 + 약관 3 + 광고 문구 5 + 버튼 1 = 39, 분모 49 → 79.5 → 79. 처리방침 실패(동의 문구 "개인정보 수집·이용 동의"는 흔적 패턴이 아님 → 확실한 부재) → `blocked`, 상한 적용 → **59**
