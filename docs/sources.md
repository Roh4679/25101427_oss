# 오픈소스 사용 내역

vibe-signoff(MIT)가 사용하거나 참고한 외부 오픈소스를 모두 적는다. 오픈소스(패키지, 참고한 코드·패턴)를 도입하면 **같은 커밋에서** 이 문서를 갱신한다 (CLAUDE.md 의존성 규칙). 라이선스 전문·고지 형식은 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)와 내용을 맞춘다.

기준일: 2026-11-28 (`package-lock.json` 기준)

## 1. npm 패키지 (직접 의존성)

| 이름 | 버전 | 라이선스 | 어디에 썼나 | 구분 | 도입 커밋 |
|---|---|---|---|---|---|
| commander | 15.1.0 | MIT | `src/cli.ts` 명령·옵션 파싱 | 런타임 | `422c5fe` (14.0.3으로 도입), `91a19f1` (15로 올림) |
| zod | 4.6.7 | MIT | 설정 파일(`src/config.ts`), 지식 베이스 YAML(`src/knowledge/`), 사용자 `package.json`, 정답지·fixture 준비 파일 검증 | 런타임 | `422c5fe` |
| js-yaml | 5.5.0 | MIT | `src/knowledge/` 지식 베이스·서비스 대응표·표시 이름 YAML 읽기 | 런타임 | `91a19f1` |
| typescript | 6.0.3 | Apache-2.0 | 빌드(`npm run build`), 타입 검사 | 개발용 | `422c5fe` |
| @types/node | 22.20.7 | MIT | Node 타입 정의 | 개발용 | `422c5fe` (20.x), `91a19f1` (22.x) |
| eslint | 10.15.0 | MIT | 린트 | 개발용 | `422c5fe` |
| typescript-eslint | 8.74.0 | MIT | `eslint.config.js` TypeScript 규칙 | 개발용 | `422c5fe` |
| tsx | 4.23.15 | MIT | `npm run dev`, `npm run demo` (TypeScript 바로 실행) | 개발용 | `422c5fe` |
| vitest | 5.1.2 | MIT | 단위·골든 테스트 | 개발용 | `422c5fe` (4.1.12), `91a19f1` (5로 올림) |
| playwright | 1.65.1 | Apache-2.0 | `--live` 렌더링 검사 (`src/rules/live/`). `--live`일 때만 동적 import | **선택 설치** (optional peer dependency). 저장소에서는 테스트용 devDependency | 6단계 커밋 `feat(live): ...` (이 행을 추가한 커밋) |
| @axe-core/playwright | 4.14.1 | MPL-2.0 | 색 대비·접근성 요약 (`src/rules/live/crawl.ts`). 수정 없이 사용 | **선택 설치** (optional peer dependency). 테스트용 devDependency | 6단계 커밋 (위와 같음) |
| axe-core | 4.14.1 | MPL-2.0 | @axe-core/playwright의 의존성. 수정 없이 사용 | 선택 설치 (간접) | 6단계 커밋 (위와 같음) |

- 저장소 기록에 있는 `f1e8a6b`(2026-11-25)는 이 저장소에 있던 **이전 프로젝트**의 커밋이다 (`7e41cd5`에서 교체). vibe-signoff의 도입 커밋이 아니다.
- 버전 선택 이유: 최소 Node는 22.12 (`engines`). typescript-eslint 8.74가 TypeScript 6.1 미만만 지원해 TypeScript는 6.0을 쓴다.

### 간접 의존성 라이선스 (`package-lock.json` 전체 192개)

| 라이선스 | 개수 | 비고 |
|---|---|---|
| MIT | 144 | 런타임: commander, zod, js-yaml |
| Apache-2.0 | 17 | 개발용·선택 설치 (`playwright`, `playwright-core` 포함) |
| MPL-2.0 | 14 | 개발용: `lightningcss`와 플랫폼별 바이너리 (vitest → vite 경유). 선택 설치: `@axe-core/playwright`, `axe-core` (수정 없이 사용, 배포물에 포함하지 않음) |
| BSD-2-Clause, BSD-3-Clause | 8 | 개발용 |
| ISC | 6 | 개발용 |
| BlueOak-1.0.0 | 2 | 개발용 (`minimatch` 등) |
| PSF-2.0 | 1 | **런타임**: `argparse` 3.0.4 (js-yaml의 의존성). Python Software Foundation 허용형 라이선스로 MIT 프로젝트와 함께 배포할 수 있다 |

GPL 계열은 없다. 기본 설치(런타임)에 함께 설치되는 패키지는 commander, zod, js-yaml, argparse 4개 그대로다. playwright·axe는 `--live`를 쓰는 사용자가 따로 설치한다.

## 2. 참고한 표준·문서·형식 (코드 복사 없음)

| 이름 | 라이선스 | 무엇을 참고했나 | 어디에 썼나 | 도입 커밋 |
|---|---|---|---|---|
| SARIF 2.1.0 (OASIS 표준) | OASIS 표준 문서 | 출력 형식 | `docs/spec/report-schema.md` 4장 (구현은 8단계) | `70e6b57` |
| Google 태그(gtag.js) 설치 안내 | 공개 설치 안내 | 스니펫 모양 | fixture의 분석 툴 탐지용 최소 스니펫을 직접 작성 (`clean-app/app/layout.tsx`, `signup-app/pages/_app.tsx`) | `70e6b57` |
| gitleaks 설정 형식 (`[extend]`, `[allowlist]`) | MIT | 설정 파일 키 이름 | 저장소 최상위 `.gitleaks.toml` (fixture 가짜 키 예외) | `1b45d07` |
| Next.js 라우팅 규칙 (app·pages router 문서) | MIT (문서) | 파일 경로 → 주소 규칙 (`(group)`, `_폴더`, `@slot`, `index`) | `src/scanner/routes/file-routes.ts` | `5b5bdbf` |
| gitignore 문법 (Git 문서 `gitignore(5)`) | GPL-2.0 (문서) | 패턴 규칙 (`!`, 끝 `/`, 앞 `/`, `**`)의 동작 | `src/scanner/gitignore.ts`를 직접 작성. 문서 내용·코드를 복사하지 않음 | `250abe3` |
| PostgreSQL·Supabase RLS SQL 문법 | PostgreSQL License (문서) | `create table`, `alter table ... enable row level security`, `create policy ... using (...)` 문법 | `src/rules/static/database.ts` 정규식을 직접 작성 | `250abe3`, `5ba89fa` |
| Firebase 보안 규칙 문법 | 공개 문서 | `allow read, write: if ...`, `".read": true` | `src/rules/static/database.ts` | `250abe3` |
| 추적 쿠키 이름 (`_ga`, `_gid`, `_fbp`, `mp_*_mixpanel` 등) | 각 서비스의 공개 안내 | 쿠키 이름 | `knowledge/kr/services.yaml` `tracking_cookies` | 6단계 커밋 |

## 3. 탐지 패턴의 출처 확인

**다른 오픈소스의 코드·규칙 파일을 복사하거나 열람해 옮기지 않았다.**

| 패턴 | 위치 | 출처 |
|---|---|---|
| 키 형식 정규식 (`sk-`·`sk-proj-` OpenAI, `sk-ant-` Anthropic, `sk_live_`·`rk_live_` Stripe, `AKIA`·`ASIA` AWS, `ghp_` 등 GitHub, PEM `BEGIN PRIVATE KEY`, `://아이디:비밀번호@`) | `src/rules/static/secrets.ts` | 각 서비스가 공개한 키 접두사 형식을 바탕으로 직접 작성. gitleaks·trufflehog 등의 규칙 파일(`gitleaks.toml` 기본 규칙 등)은 참고하지 않았다. 접두사 형식 자체는 여러 비밀값 검사 도구에 공통으로 쓰이는 공개 정보다 |
| 분석 툴 스크립트 주소 (`googletagmanager.com/gtag/js`, `connect.facebook.net/.../fbevents.js`, `cdn.mxpnl.com`, `t1.daumcdn.net/kas/static/kp.js`, `wcs.naver.net/wcslog.js`) | `src/rules/static/scripts.ts` | 각 서비스의 공개 설치 안내에 나오는 주소 |
| 위험 패턴 (`eval`, `dangerouslySetInnerHTML`, CORS `*`) | `src/rules/static/patterns.ts` | 일반적인 보안 점검 항목을 직접 정규식으로 작성. Semgrep 규칙은 복사하지 않았다 |

외부 도구 연동(gitleaks, Semgrep 실행)은 아직 없다. 도입하면 `src/adapters/`에 두고 이 문서에 추가한다.

## 4. 도입 예정 (6단계 이후, 도입할 때 1장·2장으로 옮긴다)

| 이름 | 라이선스 | 쓸 곳 | 단계 |
|---|---|---|---|
| OSV API | 데이터 이용 조건 별도 | `security/dependencies` (`--no-network`로 끔) | 7 |
