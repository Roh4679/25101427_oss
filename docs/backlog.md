# 백로그

정해진 단계에서 처리할 일. 처리하면 지운다.

| 단계 | 할 일 | 메모 |
|---|---|---|
| 8 | commander 기본 메시지(도움말 `Usage:`, `error: unknown option` 등) 한국어화 | 지금은 오류 앞에 "명령줄 오류:"만 붙인다 (`src/cli.ts`) |
| 5 | git 어댑터 테스트는 실제 git으로 (T76~T79, 목 금지) | `docs/scoring.md` |
| 5 | 키 노출 규칙이 fixture의 `FAKE_TEST` 가짜 키(`sk-proj-FAKE_TEST_...`)도 잡는지 확인 | `fixtures/README.md` 의도적 가짜 키 |
| 7 | `commerce/terms-display` 추가 (L3·I2·P3 = 18, `trace` 필요, 전자상거래법 제10조 제1항 제5호·시행규칙 제7조는 `references`) + 정답지 4개에 `"commerce/terms-display": "na"` 추가 | 사용자 승인 (2026-11-28). 바꾼 뒤 diff만 보여 준다 |
