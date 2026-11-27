# CLAUDE.md — vibe-signoff

바이브코딩으로 만든 웹 서비스를 배포 전에 점검하고, 점수와 판정(배포 가능 / 권장 / 보완 / 차단)으로 알려주는 오픈소스 CLI.
전체 기획은 `docs/기획서.md`를 따른다. 기획서와 이 파일이 충돌하면 작업을 멈추고 사용자에게 묻는다.

## 명령어

```bash
npm run build        # TypeScript 빌드
npm test             # vitest 전체 테스트
npm run test:fixtures  # fixture 앱 대상 골든 테스트
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run dev -- scan ./fixtures/intentional/<name>   # 로컬 실행
```

작업을 끝냈다고 말하기 전에 `typecheck`, `lint`, `test`를 모두 통과시킨다.

## 아키텍처: 3계층 분리 (가장 중요한 규칙)

```
src/rules/      탐지 규칙  → 코드·화면에서 "사실(Fact)"만 수집한다
knowledge/kr/   지식 베이스 → 어떤 의무가 적용되고 무엇이 증거인지 (YAML 데이터)
src/score/      점수 모델  → L×I×P 가중치, N/A 정규화, 차단 규칙
```

- **탐지 규칙(Detector)은 판단하지 않는다.** `uses_supabase: true`, `img_missing_alt: {total, missing}`처럼 사실만 반환한다. "위반이다", 점수, 심각도는 탐지 규칙에 넣지 않는다.
- **법적 내용은 TypeScript 코드에 쓰지 않는다.** 법령명, 조문, 메시지, 수정 방법, 적용 조건, L·I·P 값은 모두 `knowledge/kr/*.yaml`에 둔다.
- **점수 계산은 `src/score/`에서만 한다.** 다른 곳에서 가중치나 판정 기준을 하드코딩하지 않는다.
- 외부 도구(gitleaks, Semgrep)는 `src/adapters/`에서만 호출하고, 결과를 Fact로 변환한다. 미설치 시 `fallback` 탐지 규칙을 쓴다.
- 새 Fact 키를 만들면 `docs/spec/facts.md`에 이름, 타입, 생성하는 Detector를 기록한다. 같은 사실에 다른 이름을 만들지 않는다.
- **페이지 존재 여부는 `src/scanner/routes/`의 라우트 해석기가 만든 페이지 목록 Fact만 사용한다.** 탐지 규칙에서 파일 이름으로 페이지를 직접 찾지 않는다. 판단 근거 우선순위는 설정 파일 지정 > `--live` 결과 > 정적 라우트 해석 > 푸터 링크이고, 노션 등 외부 링크도 "있음"으로 인정한다 (기획서 6.8).

## 디렉터리

```
src/cli.ts          진입점 (commander)
src/scanner/        파일 수집, 프로젝트 유형 감지
src/scanner/routes/ 프레임워크별 라우트 해석기 (Next.js app/pages, 정적 HTML, react-router)
src/rules/static/   정적 탐지 규칙
src/rules/live/     렌더링 탐지 규칙 (Playwright, axe-core)
src/adapters/       외부 도구 연동
src/knowledge/      YAML 로더, zod 스키마, trigger·evidence 평가기
src/score/          점수 모델
src/checklist/      수동 체크리스트
src/reporters/      terminal, markdown, html, sarif, ai-prompt
knowledge/kr/       한국 기준 지식 베이스
fixtures/intentional/  문제를 일부러 넣은 샘플 앱 + expected.json
fixtures/natural/      실제 바이브코딩으로 만든 앱 + expected.json (수정 금지)
docs/기획서.md       전체 기획
docs/spec/          facts.md, evidence-dsl.md, cli.md, report-schema.md (구현 기준 명세)
docs/               knowledge-guide.md, scoring.md
```

## 코딩 규칙

- TypeScript `strict`, ESM, Node 22.12 이상.
- 외부 입력(YAML, 설정 파일, 외부 도구 JSON)은 반드시 zod로 검증한다.
- 식별자는 영어, **코드 주석과 사용자에게 보이는 메시지는 한국어**로 쓴다.
- 함수는 작게, 부수효과는 경계(CLI, 파일 I/O, 브라우저)에만 둔다. 탐지 규칙과 평가기는 테스트하기 쉬운 순수 함수로 만든다.
- 정규식 탐지는 처음엔 단순하게 시작하고, 오탐이 테스트로 확인될 때만 파서(@babel/parser, ts-morph)로 바꾼다.
- 한국어 텍스트 매칭은 공백·띄어쓰기 변형을 정규화한 뒤 비교한다 (예: "국외 이전" = "국외이전").

## 의존성 규칙

- **새 npm 패키지는 사용자에게 먼저 묻고 추가한다.** 이유, 라이선스, 주간 다운로드 수, 유지 상태를 함께 말한다.
- MIT 프로젝트와 충돌하는 라이선스(GPL 등)는 쓰지 않는다. 추가한 의존성은 `THIRD_PARTY_NOTICES.md`에 기록한다.
- Semgrep 규칙 파일 등 재배포 제한이 있는 콘텐츠를 저장소에 복사하지 않는다.
- 패키지 이름이 실제로 존재하는지 확인하고 설치한다. 이름을 추측하지 않는다.

## 법적 지식 베이스 작성 규칙

- **도구는 법적 적절성을 판단하지 않는다.** "필요한 고지·장치가 있는가"만 확인한다.
- 메시지에 "위법", "불법", "위반입니다"를 쓰지 않는다. "확인 필요", "~가 보이지 않습니다"로 쓴다.
- 모든 법적 항목에는 `principle.law`, `principle.source`, `principle.verified_at`이 있어야 한다.
- **조문 번호나 법 내용을 추측해서 쓰지 않는다.** 확인되지 않은 내용은 `article: TODO-확인필요`로 두고 사용자에게 알린다.
- 새 항목을 추가하면 `factors`(L, I, P)를 기획서 5.1 기준으로 정하고, 근거를 YAML 주석으로 남긴다.

## 테스트 규칙

테스트 데이터는 세 종류로 나누고, 만드는 주체와 정답 작성 주체를 구분한다.

| 종류 | 위치 | 만드는 주체 | 정답 작성 |
|---|---|---|---|
| 단위 테스트 | `src/**/*.test.ts` | Claude Code | Claude Code (사용자가 검토) |
| 의도적 fixture | `fixtures/intentional/` | Claude Code | **사용자** |
| 자연 발생 fixture | `fixtures/natural/` | 다른 AI 코딩 도구로 평범하게 만든 앱 | **사용자** |

- 탐지 규칙과 지식 베이스 항목마다 **통과 케이스와 실패 케이스 테스트를 최소 하나씩** 만든다. 테스트 입력은 짧은 코드 조각으로 만든다.
- 각 fixture 앱에는 `expected.json`(적용 의무, 결과, 판정)을 두고 골든 테스트로 비교한다.
- **`expected.json`은 평가의 정답지다. 사용자 승인 없이 만들거나 수정하지 않는다.**
  - 의도적 fixture를 새로 만들 때는 앱 코드와 함께 `expected.json` **초안**을 `expected.draft.json`으로 만들고, 사용자가 검토해 `expected.json`으로 확정한다.
  - 골든 테스트가 실패하면 정답지가 아니라 **코드를 고친다.** 정답지가 틀렸다고 판단되면 수정하지 말고 이유를 설명한 뒤 사용자에게 묻는다.
- `fixtures/natural/`의 앱 코드는 수정하지 않는다. 실제 바이브코딩 결과물 그대로여야 평가 의미가 있다.
- 의도적 fixture에 문제를 심을 때는 `fixtures/intentional/<name>/README.md`에 심은 문제 목록을 적는다.
- `fixtures/intentional/clean-app`은 오탐 측정용이다. 여기서 경고가 나오면 회귀로 본다.
- 점수 모델은 N/A 정규화, 차단 규칙(상한 59점), 완화 규칙(`--live` 없이 페이지를 못 찾은 치명 항목은 "확인 필요"), 경계값(70, 90점), 종료 코드를 반드시 테스트한다.
- 버그를 고칠 때는 재현 테스트를 먼저 쓴다.

## 도구 자체의 보안

- 사용자 코드를 외부로 보내지 않는다. 외부 네트워크 요청은 OSV 조회(`--no-network`로 끔)와 `--ai` 옵션(켤 때만)뿐이다. `--live`는 사용자가 준 URL만 연다.
- 사용자 프로젝트의 코드나 스크립트를 실행하지 않는다. 실행하는 외부 프로그램은 `src/adapters/`의 검사 도구(gitleaks 등)뿐이다.
- **탐지한 비밀값을 출력·로그·리포트에 그대로 쓰지 않는다.** 앞 4자만 남기고 마스킹한다 (`sk-a****`).
- 렌더링 검사에 공격성 요청(무차별 대입, 대량 요청, 인증 우회 시도)을 넣지 않는다.

## 작업 방식

- `docs/기획서.md` 7장의 개발 순서를 따른다. 한 번에 한 단계씩 진행한다. 1단계(`docs/spec/` 명세와 첫 fixture)를 마치기 전에는 구현 코드를 쓰지 않는다.
- 구현이 `docs/spec/`과 달라져야 하면 명세를 먼저 고치자고 제안하고, 승인을 받은 뒤 명세와 코드를 함께 바꾼다.
- 여러 파일을 바꾸는 작업은 먼저 계획을 보여 주고 확인을 받는다.
- 기획서에 없는 기능이나 구조 변경이 필요하면 구현하기 전에 사용자에게 묻는다.
- 규칙을 추가하면 지식 베이스, 테스트, `docs/spec/facts.md`를 함께 갱신한다. fixture가 필요하면 `fixtures/intentional/`에 만들고 정답은 `expected.draft.json`으로 둔다.
- 커밋 메시지는 Conventional Commits를 따른다 (`feat(rules): ...`, `fix(score): ...`, `docs(knowledge): ...`).

## 완료 조건 (Definition of Done)

1. `typecheck`, `lint`, `test`, `test:fixtures` 통과
2. 새 규칙에 통과·실패 테스트 존재
3. 새 Fact 키가 `docs/spec/facts.md`에 기록됨
4. 사용자 메시지가 한국어이고 "확인 필요" 표현을 따름
5. 새 의존성이 있으면 `THIRD_PARTY_NOTICES.md` 갱신
6. `expected.json`을 사용자 승인 없이 바꾸지 않음
