# signup-app (회원가입 앱)

Next.js **pages router**로 만든 중고거래 회원가입 서비스. 기획서 8.1 "회원가입 앱".

## 심은 문제

| # | 문제 | 위치 | 걸려야 하는 의무 |
|---|---|---|---|
| 1 | 개인정보 처리방침 페이지·링크 없음 | `pages/`, `pages/_app.tsx` 푸터 | `privacy/policy-page` → **차단** (처리방침 흔적이 프로젝트 어디에도 없어 확실한 부재). 하위 의무 `privacy/policy-contents`는 `na` |
| 2 | 과도한 정보 수집 (생년월일, 성별, 주소) | `pages/signup.tsx` | `privacy/minimal-collection` |
| 3 | 선택 동의(마케팅)가 기본 체크됨 | `pages/signup.tsx` `defaultChecked` | `privacy/consent-checkbox` → **차단** |
| 4 | GA를 쓰는데 처리방침에 고지 없음 | `pages/_app.tsx` | `privacy/analytics-disclosure`, `privacy/cookie-consent` → 처리방침 자체가 없어 `na` (`depends_on`). 처리방침을 추가한 뒤 다시 검사하면 걸려야 한다. 점수와 상관없이 처리방침 Finding의 `policyTodo`에 "분석 도구: ga4", 쿠키 항목이 나와야 한다 (T55) |

## 일부러 넣은 "통과해야 하는" 요소

- 약관 페이지는 있음 → `ux/terms-page` 통과.
- 이미지에 alt 있음, 버튼 문구 명확 → `accessibility/img-alt`, `ux/button-labels` 통과.
