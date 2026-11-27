# 점수 모델

`src/score/`가 구현하는 규칙의 **단일 기준**이다. 다른 문서는 이 문서를 가리키기만 한다. 가중치 산정 근거(L×I×P)는 기획서 5.1·5.2를 따른다.

## 1. 원칙

> **치명 항목은 근거가 확실할 때만 자동 차단한다.**

- 확실한 부재: 의무별로 정의된 흔적 패턴(`trace`)이 프로젝트 전체(`--live`면 렌더링한 페이지 포함)에 없음 → 실패, 차단
- 불확실함: 흔적은 있는데 장치(페이지, 고지 문구 등)를 다 확인하지 못함 → 확인 필요(0.5), 차단하지 않음
- 사람이 확인한 결과(`confirmations`)가 있으면 그것이 가장 우선한다

기획서 6.8의 "페이지 완화 규칙"은 이 원칙의 한 경우다. 흔적은 있는데 정적 분석으로 페이지를 못 찾은 것은 불확실한 실패로 본다.

## 2. 입력

평가기(`src/knowledge/`)가 의무마다 내는 값 (`evidence-dsl.md` 3.2):

```ts
{ id, applicable, outcome: "pass" | "partial" | "unknown" | "fail", score, certain: boolean, reasons, findings }
```

`certain`은 `outcome`이 `pass`가 아닐 때만 의미가 있다. 정하는 규칙은 `evidence-dsl.md` 3.3.

## 3. 계산 순서

1. **N/A**: trigger 거짓, 설정 `disable`, live 전용 의무를 정적 모드로 실행 → `na`. 계산에서 뺀다. (하위 의무의 N/A는 5번에서 정한다)
2. **위험도·등급·가중치**: `risk = L×I×P`.

   | risk | grade | 가중치 (`grade` 모드) |
   |---|---|---|
   | 18 이상 | critical | 10 |
   | 12 ~ 17 | high | 5 |
   | 6 ~ 11 | medium | 3 |
   | 5 이하 | low | 1 |

   `weightMode: raw`면 가중치 = risk.
3. **상태와 항목 점수**

   critical이 아닌 항목:

   | outcome | auto | semi |
   |---|---|---|
   | pass | `pass` 1 | `pass` 1 |
   | partial | `partial` s | `needs_review` s |
   | unknown | `needs_review` 0.5 | `needs_review` 0.5 |
   | fail | `fail` 0 | `needs_review` 0.5 |

   critical 항목 (auto·semi 공통):

   | outcome | 상태 |
   |---|---|
   | pass | `pass` 1 |
   | fail·partial·unknown + `certain: true` | `fail` 0 → **차단** |
   | fail·partial·unknown + `certain: false` | `needs_review` 0.5, `mitigated: true` |

   치명 항목은 부분 통과 비율(예: 사업자 정보 4개 중 2개)을 점수로 쓰지 않는다. 확실하면 0, 아니면 0.5다.

4. **확인 반영**: `confirmations[id]`가 `pass`면 `pass` 1, `fail`이면 `fail` 0. `confirmed: true`. 쓸 수 있는 의무는 `check: semi`이거나 grade가 critical인 의무다. 그 밖의 의무에 쓰면 경고하고 무시한다.
5. **의존 반영**: `depends_on`이 있는 의무는 상위 의무의 최종 상태(4번까지 반영)가 `pass`가 아니면 `na`(`naReason: "dependency"`)로 바꾼다. 상위 의무부터 차례로 처리한다. 하위 의무의 `confirmations`는 이때 무시한다. 상위 최종 상태가 `fail`이면 적용 조건이 참인 하위 의무의 `parent_hint`를 상위 Finding의 `policyTodo`에 붙인다 (점수 영향 없음, evidence-dsl.md 3.4).
6. **총점**: `floor(Σ(가중치 × 점수) / Σ(가중치) × 100)`. 적용 항목이 없으면 100.
7. **차단**: critical이면서 상태가 `fail`인 의무가 하나라도 있으면 `blocked`, 총점 = `min(총점, 59)`. 차단을 일으킨 id를 `blockers`에 넣는다.
8. **판정**: 차단이 아니면 90 이상 `ready`, 70 ~ 89 `ready_with_fixes`, 70 미만 `needs_work`.
9. **영역 점수**: 6번과 **같은 식, 같은 내림**을 영역별로 적용한다. 적용 항목이 없는 영역은 `null`. 차단 상한(59)은 총점에만 적용한다.

### 내림을 쓰는 이유

반올림하면 89.5점이 90점(`ready`)이 되고, 69.5점이 70점(`ready_with_fixes`)이 된다. 판정 경계에서 점수를 올려 주지 않으려고 총점과 영역 점수 모두 내림을 쓴다. 따라서 화면에 보이는 점수와 판정은 항상 일치한다.

## 4. 치명 항목별 동작

`certain`은 평가기가 정한다 (`evidence-dsl.md` 3.3). 흔적 패턴은 지식 베이스 YAML의 `trace` 필드다.

| 의무 | 흔적 패턴(`trace`) | 흔적 없음 | 흔적 있음 + 장치 확인 안 됨 | 통과 |
|---|---|---|---|---|
| `privacy/policy-page` | "개인정보처리방침", "privacy policy" | 차단 | 확인 필요 | 페이지 또는 그 텍스트의 링크(외부 포함) |
| `commerce/refund-policy` | "청약철회", "환불정책", "환불규정", "환불안내", "취소·환불", "교환·반품", "교환/반품", "반품안내" ("환불" 단독은 아님) | 차단 | 확인 필요 | 환불 페이지, 또는 페이지 본문·푸터에 흔적 (전용 페이지 불필요) |
| `commerce/business-info` | "사업자등록번호", "통신판매업", 사업자등록번호 형식 | 차단 | 확인 필요 | 상호·대표자·사업자등록번호·통신판매업 4개 모두 |
| `security/*`, `privacy/consent-checkbox` | 없음 (관찰된 사실로 판정) | — | — | 실패하면 항상 확실 → 차단 |

`--live` 모드라도 흔적이 하나라도 있으면 차단하지 않는다. 크롤링하지 못한 화면(로그인 뒤 결제 화면 등)에 고지가 있을 수 있기 때문이다. 정적 코드에 흔적이 남아 있으면 렌더링 결과에 없어도 "확인 필요"다.

설정 파일 `pages`에 지정한 페이지는 흔적 판정보다 우선해 통과한다 (`evidence-dsl.md` 3.5). 흔적 패턴 비교에도 띄어쓰기 정규화가 적용된다.

차단 메시지에는 해결 방법을 함께 적는다: 고지를 추가하거나, 이미 다른 곳에 있으면 `signoff.config.json`의 `pages`에 주소를 지정하거나, 직접 확인한 뒤 `confirmations`에 `pass`를 적는다.

## 5. 필수 테스트 케이스 (`src/score/*.test.ts`, `src/knowledge/*.test.ts`, 3단계에서 작성)

**확실성 기준 — 환불 정책** (결제 SDK 있음)

| # | 입력 | 기대 결과 |
|---|---|---|
| T1 | 흔적 전체에 없음 (정적) | `fail` 0, `blocked` |
| T2 | 결제 컴포넌트에만 "청약철회" (페이지·푸터 아님, 정적) | `needs_review` 0.5, `mitigated`, 차단 없음 |
| T3 | T2 + `--live`, 렌더링한 페이지엔 흔적 없음 (결제 화면이 로그인 뒤) | `needs_review` 0.5, 차단 없음 |
| T4 | `--live`, 렌더링한 페이지와 코드 어디에도 흔적 없음 | `fail`, `blocked` |
| T5 | 전용 페이지 없이 약관 페이지 본문에 "청약철회" | `pass` |
| T6 | 푸터에 "환불 정책" 문구 | `pass` |
| T7 | `/refund` 전용 페이지 | `pass` |
| T8 | "환불은 고객센터로 문의" 만 있음 (흔적 아님) | `fail`, `blocked` |

**확실성 기준 — 사업자 정보** (결제 SDK 있음)

| # | 입력 | 기대 결과 |
|---|---|---|
| T9 | 4항목 모두 없음 | `fail`, `blocked` |
| T10 | "상호", "대표"만 있음 (흔적 없음) | `fail`, `blocked` |
| T11 | "사업자등록번호"만 있음 (흔적 있음, 1/4) | `needs_review` 0.5 (비율 0.25가 아님), 차단 없음 |
| T12 | `123-45-67890` 형식 번호 + 상호 + 대표자 (3/4) | `needs_review` 0.5 |
| T13 | 4항목 모두 | `pass` |

**확실성 기준 — 처리방침** (개인정보 폼 있음)

| # | 입력 | 기대 결과 |
|---|---|---|
| T14 | 흔적 전체에 없음 | `fail`, `blocked` |
| T15 | 동의 체크박스 라벨 "개인정보 수집·이용 동의"만 있음 (흔적 아님) | `fail`, `blocked` (fixture `consent-label-app`) |
| T16 | 체크박스 라벨 "개인정보처리방침에 동의합니다"만 있고 페이지·링크 없음 | `needs_review` 0.5, 차단 없음 |
| T17 | 푸터에 "개인정보처리방침" 노션 외부 링크 | `pass` |
| T18 | `/privacy` 페이지가 있고 링크 텍스트는 "Privacy"뿐 (흔적 문구 없음) | `pass` (페이지가 맞으면 흔적이 없어도 확실한 실패가 아님) |

**사람 확인, 해당 없음, 비치명 항목**

| # | 입력 | 기대 결과 |
|---|---|---|
| T19 | T2 + `confirmations: fail` | `fail` 0, `confirmed`, `blocked` |
| T20 | T1 + `confirmations: pass` | `pass` 1, `confirmed`, 차단 없음 |
| T21 | 결제 SDK 없음 | 환불·사업자 정보 모두 `na`, 분모에서 빠짐 |
| T22 | 비치명 auto 항목 정적 페이지 미탐 (`legal/terms-page`) | `fail` 0, 차단 없음 |
| T23 | `confirmations`를 비치명 auto 항목에 씀 | 경고, 무시 |
| T24 | 치명 항목인데 `page_exists`를 쓰면서 `trace`가 없는 YAML | 지식 베이스 로더 스키마 오류 (종료 코드 2) |

**`all_text` 범위**

| # | 입력 | 기대 결과 |
|---|---|---|
| T25 | 흔적이 최상위 `docs/`·`README.md`·`*.test.tsx`·코드 주석에만 있음 | 흔적 없음으로 판정 |
| T26 | 흔적이 `app/docs/refund/page.tsx`, `locales/ko.json` 값, 문자열 상수에 있음 | 흔적 있음으로 판정 |

**점수·판정 경계**

| # | 입력 | 기대 결과 |
|---|---|---|
| T27 | 가중 평균 89.9 | 89, `ready_with_fixes` |
| T28 | 가중 평균 90.0 | 90, `ready` |
| T29 | 가중 평균 69.9 / 70.0 | 69 `needs_work` / 70 `ready_with_fixes` |
| T30 | 차단 + 가중 평균 92 | 59, `blocked` |
| T31 | 차단 + 가중 평균 40 | 40, `blocked` |
| T32 | 영역 가중 평균 79.6 | 영역 점수 79 |
| T33 | 적용 항목 0개인 영역 | `null` |
| T34 | `weightMode: raw` | 가중치 = risk |
| T35 | 종료 코드 | `ready`·`ready_with_fixes` → 0, `needs_work`·`blocked` → 1 |

**하위 의무 (`depends_on`)**

| # | 입력 | 기대 결과 |
|---|---|---|
| T36 | 처리방침 `fail` | `policy-contents`, `analytics-disclosure`, `cookie-consent` 등 하위 의무 `na` (`naReason: dependency`), 분모에서 빠짐 (fixture `consent-label-app`, `signup-app`) |
| T37 | 처리방침 `needs_review` (흔적만 있음) | 하위 의무 `na` |
| T38 | 처리방침 `pass`, 필수 항목 일부 없음 | `policy-contents` 정상 평가 → `needs_review` s |
| T39 | 처리방침 `needs_review` + `confirmations: pass` | 상위 `pass` → 하위 정상 평가 |
| T40 | 처리방침 `na` (개인정보 수집 안 함) | 하위 의무 `na` |
| T41 | 하위 의무에 `confirmations` | 상위가 `pass`가 아니면 무시 (`na` 유지) |
| T42 | `depends_on` 대상 id 없음 / 순환 | 지식 베이스 로더 스키마 오류 (종료 코드 2) |

**환불 흔적 추가 패턴** (결제 SDK 있음, 정적, 흔적이 결제 컴포넌트에만 있음)

| # | 입력 | 기대 결과 |
|---|---|---|
| T43 | "교환·반품 안내" / "교환/반품" / "반품 안내" / "취소·환불" / "환불 안내" 중 하나 | 흔적 있음 → `needs_review`, 차단 없음 |
| T44 | T8 (흔적 없음) 차단 시 메시지 | "청약철회(환불) 기간·방법 안내가 보이지 않습니다." + `pages.refundPolicy` 지정, `confirmations: pass` 안내 포함 |

**설정 파일 `pages` 우선순위**

| # | 입력 | 기대 결과 |
|---|---|---|
| T45 | `pages.privacyPolicy` = 노션 URL, 프로젝트에 처리방침 흔적 없음 (정적) | `privacy/policy-page` `pass` (흔적 판정보다 우선), `configPage.verified: false`, "설정으로 지정됨(미검증)" 표시 |
| T46 | T45의 하위 의무 `policy-contents` (정적, 외부 본문 못 읽음) | `unknown` → `needs_review` 0.5 |
| T47 | `pages.refundPolicy` = "/refund", 흔적 없음 (정적) | `commerce/refund-policy` `pass`, `configPage.verified: false` |
| T48 | T47 + `--live`, "/refund"가 같은 origin에서 404 (410도 같음) | `fail`, 확실 → 차단, `blockers`에 포함, 메시지 "설정에 지정한 페이지가 없습니다 (404)" |
| T49 | T47 + `--live`, "/refund"가 200이고 렌더링 본문에 "환불 정책" | `pass`, `configPage { verified: true, httpStatus: 200 }`, 렌더링 본문이 `pages[].text`에 들어감 |
| T49a | T47 + `--live`, SPA라 "/refund"가 200이지만 본문이 홈 화면(흔적 없음) | `needs_review` 0.5, `mitigated: true`, 차단 없음, `configPage.verified: false` |
| T49b | `pages.terms` = "/terms", `--live` 200, 본문에 "이용약관" | `legal/terms-page` `pass` |
| T49c | `pages`로 지정 가능한 의무의 YAML에 `trace` 없음 | 지식 베이스 로더 스키마 오류 (종료 코드 2) |
| T50 | `--live` + `pages.privacyPolicy`가 다른 origin(노션) | 열지 않음, `pass`, "설정으로 지정됨(미검증)" 표시 |
| T50a | T47 + `--live`, "/refund"가 401 또는 403 | `needs_review` 0.5, `mitigated: true`, 차단 없음 |
| T50b | T47 + `--live`, "/refund"가 "/login"으로 리다이렉트되고 비밀번호 입력란 있음 | `needs_review`, 차단 없음 |
| T50c | T47 + `--live`, "/refund"가 "/refund/"로 리다이렉트된 뒤 200 | `pass` (로그인 리다이렉트 아님) |
| T50d | T47 + `--live`, "/refund"가 500 또는 시간 초과 | `needs_review`, 차단 없음 |
| T50e | T48 + `confirmations: { "commerce/refund-policy": "pass" }` | `pass`, `confirmed: true` (확인이 응답 판정보다 우선) |

**흔적 매칭의 띄어쓰기 정규화**

| # | 입력 | 기대 결과 |
|---|---|---|
| T51 | 링크가 아닌 체크박스 라벨 "개인정보 처리방침에 동의합니다" | 흔적 "개인정보처리방침"과 맞음 → `needs_review` (차단 아님) |
| T51b | 푸터 링크 텍스트 "개인정보 처리방침" (href 대상 페이지 해석 실패) | `page_exists`의 `link_text` 비교에도 정규화 적용 → `pass` |
| T52 | 텍스트 "개인정보  처리 방침" (공백 여러 개, NBSP 포함) | 흔적 있음 |
| T53 | 결제 컴포넌트에 "환불 정책" | 흔적 있음 → `needs_review` |
| T54 | 텍스트 "교환 · 반품" (가운뎃점 앞뒤 공백) | 흔적 "교환·반품"과 맞음 |

**상위 실패 시 처리방침 포함 항목 안내 (`parent_hint` → `policyTodo`)**

| # | 입력 | 기대 결과 |
|---|---|---|
| T55 | 처리방침 `fail`, GA 사용, 개인정보 폼 있음 (fixture `signup-app`) | 처리방침 Finding의 `policyTodo`에 수집 항목(폼 필드 종류)·분석 도구(ga4)·쿠키 사용과 거부 방법이 지식 베이스 순서로 들어감. 하위 의무는 `na` 그대로, 점수 56·`blocked` 변화 없음 |
| T56 | 처리방침 `fail`, `overseas_services` = [Supabase, OpenAI, Supabase] | `policyTodo`에 "해외 서버로 이전될 수 있음: Supabase, OpenAI" (중복 없이 ", "로 연결) |
| T57 | 처리방침 `fail`, 분석 툴·해외 서비스 없음 (fixture `consent-label-app`) | `policyTodo`에 수집 항목(이메일·비밀번호)만. 분석·국외 이전·쿠키 항목 없음 |
| T58 | 처리방침 `needs_review` (흔적만 있음) | `policyTodo` 없음 |
| T59 | 처리방침 `fail` + `confirmations: pass` | 상위 `pass` → `policyTodo` 없음, 하위 정상 평가 |
| T56a | 대응표(`services.yaml`)에 없는 패키지만 있음 | `overseas_services` = [] → `privacy/overseas-transfer` `na` (trigger) |
| T56b | `services.yaml` 스키마 오류 (서비스 이름 없음 등) | 종료 코드 2 |
| T60 | `parent_hint`의 `{키}`가 facts.md에 없는 Fact | 지식 베이스 로더 스키마 오류 (종료 코드 2) |

**동의 전 쿠키 분리 (`privacy/cookie-before-consent`, 6단계)**

| # | 입력 | 기대 결과 |
|---|---|---|
| T61 | `--live`, GA 사용, 처리방침 없음, 동의 전 `_ga` 쿠키 설정 | `privacy/cookie-before-consent` 평가됨 (`depends_on` 없음). `privacy/cookie-consent`는 `na` (dependency) |
| T62 | 정적 모드, GA 사용 | `privacy/cookie-before-consent` `na` (`naReason: mode`) |
| T63 | `--live`, 동의 전 추적 쿠키 없음 | `pass` |

**키 노출과 git 추적 (`security/secret-exposure`, 5단계, facts.md 6장)**

| # | 입력 | 기대 결과 |
|---|---|---|
| T64 | `.env`가 `gitignored`, `git_tracked`에 없음 | `pass` |
| T65 | `.env`가 `gitignored`인데 `git_tracked`에 있음 (강제 추가) | `fail`, 차단 (`env_files_exposed` reason `tracked`) |
| T66 | `.env`가 있고 `.gitignore`가 없음 | `fail`, 차단 (reason `not_ignored`) |
| T67 | `.env.example`만 있고 무시되지 않음 | `pass` (`env_files`에서 제외) |
| T68 | 무시된 `.env`에 `NEXT_PUBLIC_OPENAI_API_KEY=sk-...` | `fail`, 차단 (`public_env`) |
| T69 | 무시된 `.env`에 `VITE_STRIPE_SECRET_KEY=sk_live_...` | `fail`, 차단 (`public_env`) |
| T70 | `src/api.ts`에 `"sk-proj-..."` 문자열 | `fail`, 차단 (`hardcoded`), 출력에는 `sk-p****`만 |
| T71 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` 사용 | `pass` (공개용 키) |
| T72 | git 미설치 또는 저장소 아님, `.gitignore`에 `.env*` | `git_tracked` Fact 없음, `gitignored`는 `.gitignore` 해석으로 → `pass` |
| T73 | fixture `clean-app` (무시된 `.env`에 `SUPABASE_SERVICE_ROLE_KEY`) | 100점, `ready`, 정답지 변화 없음 |
| T74 | 골든 테스트 (`git: false`), fixture의 `.env`가 vibe-signoff 저장소에 강제 추가돼 있음 | `git_tracked` Fact 없음 → 저장소 추적 정보가 판정에 영향 없음 |
| T75 | `.gitignore`의 부정 패턴 `.env*` + `!.env.example` | `.env.local`은 `gitignored`, `.env.example`은 아님 |
