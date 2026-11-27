# trigger · evidence 명세

지식 베이스 항목의 `trigger`(적용 조건)와 `evidence`(충족 증거)가 무엇을 뜻하는지 정한다. 평가기는 `src/knowledge/`에 있고 순수 함수다.

## 1. 텍스트 정규화

비교 전에 양쪽 문자열에 똑같이 적용한다.

1. Unicode NFC
2. 영문 소문자화
3. 모든 공백 문자 제거 (`"국외 이전"` = `"국외이전"`)

## 2. trigger

결과는 참/거짓이다. `trigger`를 생략하면 **항상 적용**된다.

| 형태 | 의미 |
|---|---|
| `"fact_key"` | Fact가 참이면 적용 (아래 참 판정) |
| `{ all: [조건...] }` | 모두 참 |
| `{ any: [조건...] }` | 하나 이상 참 |
| `{ not: 조건 }` | 부정 |
| `{ fact: key, eq: 값 }` | Fact 값이 정확히 같음 (예: `{ fact: scan_mode, eq: live }`) |

**참 판정**: Fact 없음 → 거짓. `true` → 참. 배열은 비어 있지 않으면 참. 문자열은 비어 있지 않으면 참. 숫자는 0이 아니면 참. 그 밖의 객체는 참.

```yaml
trigger:
  all:
    - collects_personal_info
    - any: [uses_supabase, uses_firebase, uses_openai, uses_anthropic, uses_vercel]
```

## 3. evidence

`evidence`는 증거 목록이다. **모두 충족해야** 통과다 (AND). 각 증거는 다음 중 하나를 낸다.

| 결과 | 값 | 비고 |
|---|---|---|
| `pass` | 1 | |
| `partial` | 0 < s < 1 | 비율 증거만 |
| `unknown` | — | 정적으로 확인할 수 없음 (외부 페이지 본문 등) |
| `fail` | 0 | `reason`과 Finding 위치를 함께 낸다 |

### 3.1 증거 유형

| 유형 | 형태 | 판정 |
|---|---|---|
| `page_exists` | `{ kind?: privacy\|terms\|refund, match: [단어...] }` | `pages` 중 `kind`가 같거나, path·`link_text`·`title`에 단어가 하나라도 들어간 항목이 있으면 pass (외부 링크 포함). 없으면 fail, `reason: page_missing` |
| `page_text_contains` | `{ page: { kind?, match }, any_of: [...] }` 또는 `all_of: [...]` | 페이지를 찾지 못하면 fail(`page_missing`). 찾았지만 `text`가 없으면 unknown. `any_of`: 하나라도 있으면 pass. `all_of`: 항목별 포함 비율 (전부 → pass, 일부 → partial, 없음 → fail) |
| `truthy` | `fact_key` | 참이면 pass |
| `falsy` | `fact_key` | 거짓(없음, 빈 배열 포함)이면 pass. 실패 시 배열 원소마다 Finding |
| `coverage` | `fact_key` | 값 `{ total, missing }`. `1 - missing/total`. total 0이면 pass |
| `text_contains` | `{ fact, field?, any_of \| all_of }` | 대상 텍스트(문자열 Fact, 또는 배열 원소의 `field`)를 이어 붙여 검사. 판정은 `page_text_contains`와 같음 |
| `text_absent` | `{ fact, field?, any_of, exact? }` | 배열 원소의 `field` 값에 단어가 **하나도 없으면** pass. `exact: true`면 부분 일치가 아니라 정규화 후 완전 일치. 걸린 원소마다 Finding |
| `every` | `{ fact, field }` | 배열의 모든 원소에서 `field`가 참이면 pass |
| `none` | `{ fact, field }` | 배열의 어떤 원소에서도 `field`가 참이 아니면 pass |
| `any` | `[증거...]` | 하위 증거 중 가장 좋은 결과 (OR) |

- `any_of`·`all_of`의 원소는 문자열, **동의어 배열**, 또는 `{ regex: "..." }`이다. `all_of: [["처리목적", "이용목적"], "보호책임자"]` 는 항목 2개다. 동의어 배열 안에도 `{ regex }`를 섞을 수 있다. 정규식은 **정규화한 텍스트**에 적용한다 (공백이 없어진 상태).
- `any_of: $trace`라고 쓰면 그 의무의 `trace` 패턴 목록을 그대로 쓴다 (3.3).
- `field`는 점 경로다(`consent.present`). 경로 중간에 배열이 있으면 펼쳐서 모두 본다(`fields.kind`).
- 모든 증거에 `mode: live`를 붙일 수 있다. 정적 모드에서는 그 증거를 **건너뛴다** (목록에서 없는 것으로 본다).

### 3.2 증거 결합

1. `fail`이 하나라도 있으면 `fail`
2. 아니고 `unknown`이 하나라도 있으면 `unknown`
3. 아니면 점수 중 최솟값 (1이면 `pass`, 아니면 `partial`)
4. 건너뛰고 남은 증거가 없으면 `pass`

평가기 출력은 `{ id, applicable, outcome: pass|partial|unknown|fail, score, certain, reasons: string[], findings }` 이다. `certain`은 3.3으로 정한다. 이것을 상태·점수로 바꾸는 일은 점수 모델이 한다 ([docs/scoring.md](../scoring.md)).

### 3.3 흔적 패턴(`trace`)과 실패의 확실성(`certain`)

치명 항목이 "확실히 없다"고 말하려면, 그 의무에 고유한 **흔적 패턴**이 프로젝트 어디에도 없어야 한다. 흔적 패턴은 의무마다 YAML의 `trace` 필드로 정의한다.

```yaml
trace: ["개인정보처리방침", "privacy policy"]   # any_of와 같은 원소 문법. 정규화 후 비교
```

**`certain` 판정** (`outcome`이 `fail`, `partial`, `unknown`일 때):

| 의무 | `certain: true` 조건 |
|---|---|
| `trace`가 있음 | `trace` 패턴이 `all_text`에 하나도 없고, **그리고** 그 의무의 `page_exists` 증거가 어떤 페이지와도 맞지 않음 |
| `trace`가 없음 | `outcome`이 `fail`이면 항상 `true` (관찰된 사실로만 판정하는 의무) |

- 흔적이 하나라도 있으면 그 의무의 실패는 **언제나 불확실**하다. 모드(`--live`)와 관계없다.
- `--live` 모드에서는 `all_text`에 렌더링한 모든 페이지의 본문이 더해진다. 정적 코드의 텍스트는 그대로 남는다. 따라서 로그인 뒤 화면처럼 크롤링하지 못한 화면의 문구도 코드에 있으면 흔적으로 인정된다.
- 점수 모델은 `certain`을 **치명 항목에서만** 쓴다 ([docs/scoring.md](../scoring.md) 1장 원칙).

**`trace` 작성 규칙**
- 그 의무를 지켰을 때만 나타나는 **좁은 문구**를 쓴다. "개인정보", "환불", "대표" 같은 일반 단어는 쓰지 않는다. 일반 단어가 흔적으로 잡히면 동의 체크박스 문구만 있고 처리방침이 없는 앱이 "확인 필요"로 빠져 CI에서 차단되지 않는다.
- 치명 등급이면서 `page_exists` 또는 `page_text_contains`를 쓰는 의무는 `trace`가 **반드시** 있어야 한다. 없으면 지식 베이스 로더가 스키마 오류를 낸다.

- 흔적 비교에도 1장의 정규화가 똑같이 적용된다. `trace: ["개인정보처리방침"]`은 "개인정보 처리방침", "개인정보 처리 방침"과도 맞는다.

### 3.4 하위 의무 (`depends_on`)

상위 의무가 확인돼야 의미가 있는 의무는 `depends_on`에 상위 의무 id를 적는다.

```yaml
- id: privacy/policy-contents
  depends_on: privacy/policy-page
```

- 상위 의무의 **최종 상태**(`confirmations` 반영 후)가 `pass`일 때만 하위 의무를 평가한다.
- 상위가 `fail`, `needs_review`, `partial`, `na`면 하위 의무는 `na`(`naReason: "dependency"`)다. 없는 문서에 부분 점수를 주지 않고, 0점을 줘서 이중으로 감점하지도 않는다.
- 하위 의무에 `na`가 된 이유를 리포트에 남긴다: "처리방침이 확인되면 평가합니다."
- `depends_on`의 대상이 없거나 순환하면 지식 베이스 로더가 스키마 오류를 낸다.
- 상태 결정은 점수 모델이 한다 ([docs/scoring.md](../scoring.md) 3장 5번).

### 3.5 설정 파일 `pages` 지정

`signoff.config.json`의 `pages`에 지정한 페이지는 `PageRoute { source: "config", kind }`로 들어가며, **흔적 판정보다 우선한다.**

- `page_exists`가 `kind`로 바로 맞으므로 통과한다. 이때 `trace`를 보지 않는다 (페이지가 맞았으므로 `certain` 판정 대상이 아니다).
- 외부 URL(노션 등)은 정적 모드에서 열지 않으므로 `text`가 없다. 그 페이지의 본문을 보는 하위 의무(`page_text_contains`)는 `unknown` → 확인 필요가 된다.
- `--live` 모드에서 지정한 주소가 `--live` URL과 같은 origin이면 크롤러가 열어 본문을 채운다. 응답이 404·5xx여도 설정이 우선하므로 통과는 유지하되, 리포트에 "설정에 지정한 페이지를 열 수 없습니다" 경고를 남긴다. 다른 origin 주소는 열지 않는다 (`--live`는 사용자가 준 URL만 연다).

## 4. 1차 의무 목록

기획서 3장·5.2의 항목을 지식 베이스 id로 옮긴 것이다. 법령 내용과 메시지는 YAML에만 쓴다. 기획서 표 하나가 여러 의무로 나뉠 수 있다.

| id | 기획서 | 영역 | check | L·I·P | 적용 조건 | depends_on | 단계 |
|---|---|---|---|---|---|---|---|
| `security/secret-exposure` | SEC-01 | security | auto | 2·3·3 | 항상 | — | 5 |
| `security/db-access` | SEC-02 | security | auto | 2·3·3 | `uses_supabase` 또는 `uses_firebase` | — | 5 |
| `security/dangerous-patterns` | SEC-03 | security | semi | 2·3·2 | 항상 | — | 5 |
| `security/dependencies` | SEC-04 | security | auto | 2·3·2 | `dependency_audit` (네트워크 켬) | — | 7 |
| `privacy/policy-page` | PRIV-01 | privacy | auto | 3·2·3 | `collects_personal_info` | — | 4 |
| `privacy/policy-contents` | PRIV-01 필수 항목 | privacy | semi | 3·2·2 | `collects_personal_info` | `privacy/policy-page` | 4 |
| `privacy/overseas-transfer` | 4.2 예시 | privacy | semi | 3·2·2 | 개인정보 수집 + 해외 서비스 | `privacy/policy-page` | 4 |
| `privacy/analytics-disclosure` | PRIV-02 | privacy | auto | 3·2·2 | `analytics_scripts` | `privacy/policy-page` | 4 |
| `privacy/embed-disclosure` | PRIV-03 | privacy | auto | 2·2·2 | `external_embeds` | `privacy/policy-page` | 4 |
| `privacy/consent-checkbox` | PRIV-04 | privacy | auto | 3·2·3 | `collects_personal_info` | — | 4 |
| `privacy/minimal-collection` | PRIV-05 | privacy | semi | 3·2·2 | `collects_personal_info` | — | 7 |
| `privacy/cookie-consent` | PRIV-06 | privacy | semi | 2·2·3 | `analytics_scripts` | `privacy/policy-page` | 4 (live 증거는 6) |
| `commerce/business-info` | COM-01 | commerce | semi | 3·2·3 | `payment_sdks` | — | 7 |
| `commerce/refund-policy` | COM-02 | commerce | semi | 3·2·3 | `payment_sdks` | — | 7 |
| `legal/terms-page` | LEGAL-01 | ux (운영) | auto | 1·2·3 | 항상 | — | 4 |
| `advertising/unsupported-claims` | AD-01 | advertising | semi | 3·2·2 | 항상 | — | 7 |
| `advertising/fake-reviews` | AD-02 | advertising | semi | 3·2·2 | `review_components` | — | 7 |
| `accessibility/img-alt` | A11Y-01 | accessibility | auto | 2·1·3 | `img_missing_alt` | — | 4 |
| `accessibility/color-contrast` | A11Y-02 | accessibility | auto | 2·1·3 | `scan_mode = live` | — | 6 |
| `accessibility/keyboard-form` | A11Y-03 | accessibility | auto | 2·1·3 | `scan_mode = live` | — | 6 |
| `accessibility/axe-summary` | A11Y-04 | accessibility | semi | 2·1·3 | `scan_mode = live` | — | 6 |
| `ux/button-labels` | UX-01 | ux | semi | 1·1·3 | 항상 | — | 7 |

처리방침 본문을 보는 의무는 모두 `privacy/policy-page`에 의존한다 (3.4).

`privacy/policy-contents`, `privacy/overseas-transfer`는 기획서 5.2 표에 따로 없어 4.2 예시 값(3·2·2)을 따랐다.

## 5. 예시

```yaml
- id: privacy/consent-checkbox
  category: privacy
  check: auto
  factors: { L: 3, I: 2, P: 3 }   # L3: 동의 절차는 조문상 의무 / I2: 과태료·분쟁 / P3: 바이브코딩 폼에서 흔히 빠짐
  trigger: collects_personal_info
  evidence:
    - every: { fact: personal_forms, field: consent.present }
    - none:  { fact: personal_forms, field: consent.optional_prechecked }

- id: privacy/policy-page
  category: privacy
  check: auto
  factors: { L: 3, I: 2, P: 3 }
  trigger: collects_personal_info
  # 흔적: 처리방침 문구 또는 그 텍스트의 링크. "개인정보 수집·이용 동의" 같은 일반 문구는 흔적이 아니다
  trace: ["개인정보처리방침", "privacy policy"]
  evidence:
    # 페이지·푸터 링크(외부 노션 포함)가 있으면 통과
    - page_exists: { kind: privacy, match: ["privacy", "개인정보처리방침"] }
  # 흔적 없음 → 확실한 실패(차단) / 흔적은 있는데 페이지 없음 → 확인 필요

- id: commerce/refund-policy
  category: commerce
  check: semi
  factors: { L: 3, I: 2, P: 3 }
  trigger: payment_sdks
  # 법적 요구는 청약철회 정보 고지이지 전용 페이지가 아니다
  # "환불" 단독은 일반 단어라 흔적이 아니다
  trace: ["청약철회", "환불정책", "환불규정", "환불안내", "취소·환불", "교환·반품", "교환/반품", "반품안내"]
  evidence:
    - any:
        - page_exists: { kind: refund, match: ["refund", "환불정책", "환불규정", "청약철회"] }
        - text_contains: { fact: pages, field: text, any_of: $trace }   # 약관·결제 화면 등 페이지 본문
        - text_contains: { fact: footer_text, any_of: $trace }          # 모든 페이지 하단
  # 흔적이 코드·렌더링 결과 어디에도 없음 → 차단 / 흔적이 컴포넌트에만 있음(예: 로그인 뒤 결제 화면) → 확인 필요
  message: 청약철회(환불) 기간·방법 안내가 보이지 않습니다.
  fix: >-
    약관, 결제 화면 또는 푸터에 청약철회(환불) 기간·방법을 적으세요.
    이미 다른 곳(외부 페이지 등)에 안내하고 있다면 signoff.config.json의 pages.refundPolicy에 주소를 지정하거나,
    직접 확인한 뒤 confirmations에 "commerce/refund-policy": "pass"를 적으세요.

- id: commerce/business-info
  category: commerce
  check: semi
  factors: { L: 3, I: 2, P: 3 }
  trigger: payment_sdks
  # "상호", "대표"는 일반 단어라 흔적에서 뺀다
  trace: ["사업자등록번호", "통신판매업", { regex: '\d{3}-\d{2}-\d{5}' }]
  evidence:
    # 4개 → 통과 / 흔적 있고 일부 → 확인 필요 / 흔적 없음 → 차단
    - text_contains:
        fact: all_text
        field: text
        all_of:
          - ["상호"]
          - ["대표자", "대표"]
          - ["사업자등록번호", { regex: '\d{3}-\d{2}-\d{5}' }]
          - ["통신판매업"]

- id: ux/button-labels
  category: ux
  check: semi
  factors: { L: 1, I: 1, P: 3 }
  evidence:
    - text_absent: { fact: buttons, field: label, exact: true, any_of: ["", "클릭", "여기", "확인", "버튼", "click", "here"] }
```
