# leaky-keys-app (키 노출 앱)

Vite + 바닐라 JS로 만든 AI 문장 다듬기 서비스. 개인정보를 받지 않으므로 개인정보 의무는 모두 N/A여야 한다 (의무 매칭 정확도 확인용). 기획서 8.1 "키 노출 앱".

키 값은 모두 **가짜**다 (`FAKE`가 들어 있고 어떤 서비스에서도 동작하지 않는다).

## 심은 문제

| # | 문제 | 위치 | 걸려야 하는 의무 |
|---|---|---|---|
| 1 | 프론트 코드에 OpenAI 키 하드코딩 | `src/main.js` 3행 | `security/secret-exposure` → **차단** |
| 2 | `VITE_` 접두사 변수에 비밀 키 (번들에 포함됨) | `.env` 1행 | `security/secret-exposure` |
| 3 | `.env` 파일이 있는데 `.gitignore` 없음 | 루트 | `security/secret-exposure` |
| 4 | 이미지 2개 중 1개 alt 없음 | `index.html` 11행 | `accessibility/img-alt` (부분 통과 0.5) |
| 5 | 모호한 버튼 문구 "클릭" | `index.html` 13행 | `ux/button-labels` |

## 일부러 넣은 "통과해야 하는" 요소

- `openai`를 쓰지만 개인정보를 수집하지 않음 → `privacy/overseas-transfer`는 N/A.
- 정적 HTML 약관 페이지 `terms.html` → `legal/terms-page` 통과 (static-html 해석기 확인).
