# 점수 모델

`src/score/`가 구현하는 규칙의 **단일 기준**이다. 다른 문서는 이 문서를 가리키기만 한다. 가중치 산정 근거(L×I×P)는 기획서 5.1·5.2를 따른다.

## 1. 원칙

> **치명 항목은 근거가 확실할 때만 자동 차단한다.**

- 확실한 부재(관련 흔적이 프로젝트 전체에 없음, 또는 렌더링 결과로 확인됨) → 실패, 차단
- 일부만 발견되는 등 불확실함 → 확인 필요(0.5), 차단하지 않음
- 사람이 확인한 결과(`confirmations`)가 있으면 그것이 가장 우선한다

기획서 6.8의 "페이지 완화 규칙"은 이 원칙의 한 경우다. 정적 모드에서 페이지를 못 찾은 것은 불확실한 실패로 본다.

## 2. 입력

평가기(`src/knowledge/`)가 의무마다 내는 값 (`evidence-dsl.md` 3.2):

```ts
{ id, applicable, outcome: "pass" | "partial" | "unknown" | "fail", score, certain: boolean, reasons, findings }
```

`certain`은 `outcome`이 `fail`일 때만 의미가 있다.

## 3. 계산 순서

1. **N/A**: trigger 거짓, 설정 `disable`, live 전용 의무를 정적 모드로 실행 → `na`. 계산에서 뺀다.
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
   | fail + `certain: true` | `fail` 0 → **차단** |
   | fail + `certain: false` | `needs_review` 0.5, `mitigated: true` |
   | partial, unknown | `needs_review` 0.5, `mitigated: true` |

4. **확인 반영**: `confirmations[id]`가 `pass`면 `pass` 1, `fail`이면 `fail` 0. `confirmed: true`. 쓸 수 있는 의무는 `check: semi`이거나 grade가 critical인 의무다. 그 밖의 의무에 쓰면 경고하고 무시한다.
5. **총점**: `floor(Σ(가중치 × 점수) / Σ(가중치) × 100)`. 적용 항목이 없으면 100.
6. **차단**: critical이면서 상태가 `fail`인 의무가 하나라도 있으면 `blocked`, 총점 = `min(총점, 59)`. 차단을 일으킨 id를 `blockers`에 넣는다.
7. **판정**: 차단이 아니면 90 이상 `ready`, 70 ~ 89 `ready_with_fixes`, 70 미만 `needs_work`.
8. **영역 점수**: 5번과 **같은 식, 같은 내림**을 영역별로 적용한다. 적용 항목이 없는 영역은 `null`. 차단 상한(59)은 총점에만 적용한다.

### 내림을 쓰는 이유

반올림하면 89.5점이 90점(`ready`)이 되고, 69.5점이 70점(`ready_with_fixes`)이 된다. 판정 경계에서 점수를 올려 주지 않으려고 총점과 영역 점수 모두 내림을 쓴다. 따라서 화면에 보이는 점수와 판정은 항상 일치한다.

## 4. "확실한 실패"를 만드는 증거

`certain`은 평가기가 정한다 (`evidence-dsl.md` 3.3).

| 증거 | 실패할 때 `certain` |
|---|---|
| `page_exists` | 정적 모드 → false, `--live` 모드 → true |
| `page_text_contains` | 페이지 없음 → `page_exists`와 같음. 페이지는 있는데 문구 없음 → true |
| `text_contains` (`all_text` 대상) | true (프로젝트 전체를 봤으므로) |
| `truthy` `falsy` `coverage` `every` `none` `text_absent` | true (관찰된 사실) |

치명 항목의 YAML은 **"흔적이 어디에도 없음"을 확인하는 `text_contains`(certain) + 구체 장치를 확인하는 `page_exists`(정적에서 uncertain)**를 AND로 함께 둔다. 그러면 다음처럼 동작한다.

| 상황 (정적 모드) | 결과 |
|---|---|
| 관련 문구가 프로젝트 어디에도 없음 | 확실한 실패 → 차단 |
| 문구는 있는데 페이지를 못 찾음 | 불확실한 실패 → 확인 필요 0.5 |
| 페이지 있음 | 통과 |
| `--live`에서 문구는 있는데 페이지가 없음 | 확실한 실패 → 차단 |

## 5. 필수 테스트 케이스 (`src/score/*.test.ts`, 3단계에서 작성)

| # | 입력 | 기대 결과 |
|---|---|---|
| T1 | 결제 SDK 있음, 환불·청약철회 문구 전체에 없음 (정적) | `commerce/refund-policy` `fail` 0, `blocked` |
| T2 | 결제 SDK 있음, 푸터에 "환불" 문구만 있고 페이지 없음 (정적) | `needs_review` 0.5, `mitigated`, 차단 없음 |
| T3 | T2와 같은데 `--live` | `fail`, `blocked` |
| T4 | 결제 SDK 있음, 환불 페이지 있음 | `pass` |
| T5 | 결제 SDK 있음, 사업자 정보 4항목 중 0개 | `commerce/business-info` `fail`, `blocked` |
| T6 | 사업자 정보 4항목 중 2개 | `needs_review` 0.5 (0.5지 0.5×비율이 아님), 차단 없음 |
| T7 | 사업자 정보 4항목 모두 | `pass` |
| T8 | T2 + `confirmations: fail` | `fail` 0, `confirmed`, `blocked` |
| T9 | T1 + `confirmations: pass` | `pass` 1, `confirmed`, 차단 없음 |
| T10 | 결제 SDK 없음 | 두 의무 모두 `na`, 분모에서 빠짐 |
| T11 | 처리방침 문구 전체에 없음, 개인정보 폼 있음 (정적) | `privacy/policy-page` `fail`, `blocked` |
| T12 | 푸터에 "개인정보처리방침" 외부 링크(노션) | `pass` |
| T13 | 비치명 auto 항목 정적 페이지 미탐 (`legal/terms-page`) | `fail` 0, 차단 없음 |
| T14 | `confirmations`를 비치명 auto 항목에 씀 | 경고, 무시 |
| T15 | 가중 평균 89.9 | 89, `ready_with_fixes` |
| T16 | 가중 평균 90.0 | 90, `ready` |
| T17 | 가중 평균 69.9 / 70.0 | 69 `needs_work` / 70 `ready_with_fixes` |
| T18 | 차단 + 가중 평균 92 | 59, `blocked` |
| T19 | 차단 + 가중 평균 40 | 40, `blocked` |
| T20 | 영역 가중 평균 79.6 | 영역 점수 79 |
| T21 | 적용 항목 0개인 영역 | `null` |
| T22 | `weightMode: raw` | 가중치 = risk |
| T23 | 종료 코드 | `ready`·`ready_with_fixes` → 0, `needs_work`·`blocked` → 1 |
