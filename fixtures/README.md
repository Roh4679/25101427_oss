# fixtures

| 폴더 | 만드는 주체 | 정답 작성 |
|---|---|---|
| `intentional/` | Claude Code | 사용자 (`expected.draft.json` → 검토 → `expected.json`) |
| `natural/` | 다른 AI 코딩 도구로 평범하게 만든 앱 (**코드 수정 금지**) | 사용자 |

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

## 초안 점수 계산 근거

규칙은 [docs/scoring.md](../docs/scoring.md). 가중치: critical 10, high 5, medium 3, low 1. `floor(Σ가중치×점수 / Σ가중치 × 100)`.

- **clean-app**: 적용 14개 모두 통과 → 100, `ready`
- **signup-app**: 적용 12개. 분자 = SEC-01 10 + SEC-03 5 + 처리방침 0 + 처리방침 항목 5×0.5 + 분석 툴 고지 0 + 동의 체크박스 0 + 최소 수집 5×0.5 + 쿠키 5×0.5 + 약관 3 + 광고 문구 5 + alt 3 + 버튼 1 = 34.5, 분모 67 → 51.4 → **51**. 처리방침(프로젝트 전체에 흔적 없음 → 확실한 실패)과 동의 체크박스 실패 → `blocked`
- **leaky-keys-app**: 적용 6개. 분자 = 키 노출 0 + 위험 패턴 5 + 약관 3 + 광고 문구 5 + alt 3×0.5 + 버튼 1×0.5 = 15, 분모 27 → 55.5 → **55**. 키 노출(critical) 실패 → `blocked`
- **consent-label-app**: 적용 9개. 분자 = SEC-01 10 + SEC-03 5 + 처리방침 0 + 처리방침 항목 5×0.5 + 동의 체크박스 10 + 최소 수집 5 + 약관 3 + 광고 문구 5 + 버튼 1 = 41.5, 분모 54 → 76.8 → 76. 처리방침 실패(동의 문구 "개인정보 수집·이용 동의"는 흔적 패턴이 아님 → 확실한 부재) → `blocked`, 상한 적용 → **59**
