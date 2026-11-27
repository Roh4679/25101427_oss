# THIRD_PARTY_NOTICES

vibe-signoff(MIT)가 가져다 쓰거나 참고한 외부 오픈소스·표준을 모두 적는다. 의존성을 추가하거나 코드·패턴·데이터를 가져올 때 **같은 커밋에서** 이 파일을 갱신한다. 라이선스는 추가 시점에 각 저장소의 LICENSE 파일로 다시 확인한다.

구분
- **복사**: 코드·패턴·데이터를 저장소에 옮겨 옴 → 원본 저작권 표기와 라이선스 전문 필요
- **의존성**: npm 패키지로 설치
- **외부 실행**: 사용자 환경에 설치된 도구를 실행만 함 (저장소에 포함 안 함)
- **참고**: 형식·설계를 참고만 함 (코드 복사 없음)

## 1. 현재 사용 중

| 이름 | 라이선스 | 구분 | 어디에 썼나 | 확인일 |
|---|---|---|---|---|
| SARIF 2.1.0 (OASIS 표준) | OASIS 표준 문서 | 참고 | `docs/spec/report-schema.md` 4장 SARIF 출력 대응표 | 2026-11-27 |
| Google 태그(gtag.js) 설치 스니펫 | — (공개 설치 안내) | 참고 | `fixtures/intentional/clean-app/app/layout.tsx`, `signup-app/pages/_app.tsx`: 분석 툴 탐지 테스트용 최소 스니펫을 직접 작성 | 2026-11-27 |
| commander 15.1.0 | MIT | 의존성 | `src/cli.ts` 명령·옵션 파싱 | 2026-11-27 |
| zod 4.6.7 | MIT | 의존성 | `src/config.ts`, `src/scanner/project.ts`(package.json), 골든 테스트 정답지 검증 | 2026-11-27 |
| typescript 6.0.3 | Apache-2.0 | 의존성 (dev) | 빌드·타입 검사 | 2026-11-27 |
| @types/node 22.x | MIT | 의존성 (dev) | Node 타입 정의 | 2026-11-27 |
| eslint 10.15.0 | MIT | 의존성 (dev) | 린트 | 2026-11-27 |
| typescript-eslint 8.74.0 | MIT | 의존성 (dev) | `eslint.config.js` TS 규칙 | 2026-11-27 |
| tsx 4.23.15 | MIT | 의존성 (dev) | `npm run dev` | 2026-11-27 |
| js-yaml 5.5.0 | MIT | 의존성 | `src/knowledge/` 지식 베이스 YAML 로더 | 2026-11-27 |
| vitest 5.1.2 | MIT | 의존성 (dev) | 단위·골든 테스트 | 2026-11-27 |

버전 선택: 최소 Node는 22.12다 (`engines`, Node 20은 2026-04-30 EOL). `@types/node`는 최소 지원 버전에 맞춰 22.x를 쓴다. typescript-eslint 8.74가 TypeScript 6.1 미만만 지원해 typescript는 6.0을 쓴다.

fixture의 `package.json`에 적힌 `next`, `react`, `@supabase/supabase-js`, `openai`, `vite`는 **이름만** 적은 것이다. 설치하지 않고 저장소에 포함하지도 않는다.

복사한 코드·패턴: **없음**

## 2. 도입 예정 (기획서 6.6·6.7, 추가 시 1장으로 옮김)

| 이름 | 라이선스 (기획서 기준, 추가 시 재확인) | 구분 | 쓸 곳 | 단계 |
|---|---|---|---|---|
| @babel/parser | MIT | 의존성 | 정규식 오탐이 확인된 규칙만 | 필요 시 |
| pgsql-ast-parser | MIT | 의존성 | Supabase RLS 탐지 | 5 |
| gitleaks | MIT | 외부 실행 + 패턴 참고 | `src/adapters/gitleaks`. 패턴을 이식하면 이 표를 "복사"로 바꾸고 출처·라이선스 전문을 남긴다 | 5 |
| Playwright | Apache-2.0 | 의존성 | `src/rules/live/` | 6 |
| axe-core / @axe-core/playwright | MPL-2.0 | 의존성 (수정 없이) | 색 대비, 접근성 요약 | 6 |
| OSV API | 데이터 이용 조건 별도 | API 호출 (`--no-network`로 끔) | `security/dependencies` | 7 |
| Semgrep | 엔진·규칙 라이선스 별도 | 외부 실행만 | `src/adapters/semgrep`. **규칙 파일은 복사하지 않음** | 선택 |
