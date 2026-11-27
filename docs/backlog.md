# 백로그

정해진 단계에서 처리할 일. 처리하면 지운다.

| 단계 | 할 일 | 메모 |
|---|---|---|
| 8 | commander 기본 메시지(도움말 `Usage:`, `error: unknown option` 등) 한국어화 | 지금은 오류 앞에 "명령줄 오류:"만 붙인다 (`src/cli.ts`) |
| 7 | `commerce/terms-display` 추가 (L3·I2·P3 = 18, `trace` 필요, 전자상거래법 제10조 제1항 제5호·시행규칙 제7조는 `references`) + 정답지 4개에 `"commerce/terms-display": "na"` 추가 | 사용자 승인 (2026-11-28). 바꾼 뒤 diff만 보여 준다 |

## 사용자 결정 대기 (2026-11-28 6단계 후)

| 항목 | 질문 |
|---|---|
| `privacy/cookie-before-consent` | 국내법상 쿠키 사전 동의 의무 근거 미확인. `--region kr`은 확인 필요, `global`만 실패로 둘지 |
| `--live` 브라우저 | 설치된 Chrome·Edge로 대신 실행해도 되는지, Playwright Chromium만 쓸지 |
| 다음 단계 | 7단계(react-router 해석기, 반자동 항목, OSV) 시작 전 계획 보여 주기 (OSV는 외부 네트워크 요청) |
