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

- `any_of`·`all_of`의 원소는 문자열 또는 **동의어 배열**이다. `all_of: [["처리목적", "이용목적"], "보호책임자"]` 는 항목 2개다.
- `field`는 점 경로다(`consent.present`). 경로 중간에 배열이 있으면 펼쳐서 모두 본다(`fields.kind`).
- 모든 증거에 `mode: live`를 붙일 수 있다. 정적 모드에서는 그 증거를 **건너뛴다** (목록에서 없는 것으로 본다).

### 3.2 증거 결합

1. `fail`이 하나라도 있으면 `fail`
2. 아니고 `unknown`이 하나라도 있으면 `unknown`
3. 아니면 점수 중 최솟값 (1이면 `pass`, 아니면 `partial`)
4. 건너뛰고 남은 증거가 없으면 `pass`

평가기 출력은 `{ id, applicable, outcome: pass|partial|unknown|fail, score, reasons: string[], findings }` 이다. 이것을 상태·점수로 바꾸는 일은 점수 모델이 한다 (`report-schema.md` 3장).

## 4. 1차 의무 목록

기획서 3장·5.2의 항목을 지식 베이스 id로 옮긴 것이다. 법령 내용과 메시지는 YAML에만 쓴다. 기획서 표 하나가 여러 의무로 나뉠 수 있다.

| id | 기획서 | 영역 | check | L·I·P | 적용 조건 | 단계 |
|---|---|---|---|---|---|---|
| `security/secret-exposure` | SEC-01 | security | auto | 2·3·3 | 항상 | 5 |
| `security/db-access` | SEC-02 | security | auto | 2·3·3 | `uses_supabase` 또는 `uses_firebase` | 5 |
| `security/dangerous-patterns` | SEC-03 | security | semi | 2·3·2 | 항상 | 5 |
| `security/dependencies` | SEC-04 | security | auto | 2·3·2 | `dependency_audit` (네트워크 켬) | 7 |
| `privacy/policy-page` | PRIV-01 | privacy | auto | 3·2·3 | `collects_personal_info` | 4 |
| `privacy/policy-contents` | PRIV-01 필수 항목 | privacy | semi | 3·2·2 | `collects_personal_info` | 4 |
| `privacy/overseas-transfer` | 4.2 예시 | privacy | semi | 3·2·2 | 개인정보 수집 + 해외 서비스 | 4 |
| `privacy/analytics-disclosure` | PRIV-02 | privacy | auto | 3·2·2 | `analytics_scripts` | 4 |
| `privacy/embed-disclosure` | PRIV-03 | privacy | auto | 2·2·2 | `external_embeds` | 4 |
| `privacy/consent-checkbox` | PRIV-04 | privacy | auto | 3·2·3 | `collects_personal_info` | 4 |
| `privacy/minimal-collection` | PRIV-05 | privacy | semi | 3·2·2 | `collects_personal_info` | 7 |
| `privacy/cookie-consent` | PRIV-06 | privacy | semi | 2·2·3 | `analytics_scripts` | 4 (live 증거는 6) |
| `commerce/business-info` | COM-01 | commerce | semi | 3·2·3 | `payment_sdks` | 7 |
| `commerce/refund-policy` | COM-02 | commerce | semi | 3·2·3 | `payment_sdks` | 7 |
| `legal/terms-page` | LEGAL-01 | ux (운영) | auto | 1·2·3 | 항상 | 4 |
| `advertising/unsupported-claims` | AD-01 | advertising | semi | 3·2·2 | 항상 | 7 |
| `advertising/fake-reviews` | AD-02 | advertising | semi | 3·2·2 | `review_components` | 7 |
| `accessibility/img-alt` | A11Y-01 | accessibility | auto | 2·1·3 | `img_missing_alt` | 4 |
| `accessibility/color-contrast` | A11Y-02 | accessibility | auto | 2·1·3 | `scan_mode = live` | 6 |
| `accessibility/keyboard-form` | A11Y-03 | accessibility | auto | 2·1·3 | `scan_mode = live` | 6 |
| `accessibility/axe-summary` | A11Y-04 | accessibility | semi | 2·1·3 | `scan_mode = live` | 6 |
| `ux/button-labels` | UX-01 | ux | semi | 1·1·3 | 항상 | 7 |

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

- id: ux/button-labels
  category: ux
  check: semi
  factors: { L: 1, I: 1, P: 3 }
  evidence:
    - text_absent: { fact: buttons, field: label, exact: true, any_of: ["", "클릭", "여기", "확인", "버튼", "click", "here"] }
```
