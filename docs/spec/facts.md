# Fact 명세

탐지 규칙(Detector)이 만드는 사실(Fact)의 목록이다. **여기 없는 키는 만들지 않는다.** 새 키가 필요하면 이 문서부터 고친다.

```ts
interface Fact {
  key: string;
  value: unknown;
  location?: { file?: string; line?: number; url?: string };
}
```

## 공통 규칙

- 키는 `snake_case`. 같은 사실에 두 이름을 만들지 않는다.
- Fact는 **사실만** 담는다. "위반", 점수, 심각도, 법령 문구는 넣지 않는다.
- 판단에 쓰이는 단어 목록(광고 문구, 모호한 버튼 문구, 과도한 수집 항목 등)은 지식 베이스(YAML)에 두고, Detector는 원재료(텍스트, 라벨, 필드 종류)만 넘긴다.
- 배열 Fact의 각 원소는 가능하면 `file`, `line`을 갖는다. 평가기는 이 값으로 Finding 위치를 만든다.
- 찾은 것이 없으면 배열 Fact는 빈 배열 `[]`로 낸다. **불리언 Fact가 없으면 `false`로 본다.**
- 비밀값은 Fact에 원문을 넣지 않는다. `masked`(앞 4자 + `****`)만 넣는다.
- 텍스트 값은 원문 그대로 넣는다. 비교 직전 정규화는 평가기가 한다(`evidence-dsl.md`의 정규화 규칙).
- 파일 경로는 프로젝트 루트 기준 상대 경로, `/` 구분자.

## 공통 타입

```ts
type Loc = { file: string; line: number };

interface PageRoute {
  path: string;                  // "/privacy", 외부 링크면 링크가 걸린 주소 그대로
  file?: string;                 // "app/(legal)/privacy/page.tsx"
  external?: string;             // 외부 링크로 대체한 경우의 URL
  source: "file-route" | "code-route" | "footer-link" | "config" | "live";
  kind?: "privacy" | "terms" | "refund";  // 설정 파일로 지정한 경우에만 채워짐
  link_text?: string;            // 푸터 링크 텍스트
  title?: string;                // <h1> 또는 <title> 텍스트
  text?: string;                 // 페이지 본문 텍스트. 정적으로 못 읽으면 없음
}
```

## 1. 프로젝트 (src/scanner)

| 키 | 타입 | 생성 | 설명 | 단계 |
|---|---|---|---|---|
| `scan_mode` | `"static" \| "live"` | scanner | `--live` 사용 여부 | 2 |
| `framework` | `"next-app" \| "next-pages" \| "react-router" \| "static-html" \| "unknown"` | scanner | 주 라우팅 방식. 우선순위 next-app > next-pages > react-router > static-html | 2 |
| `dependencies` | `string[]` | scanner | package.json의 dependencies + devDependencies 이름 | 2 |
| `uses_supabase` | `boolean` | scanner | `@supabase/*` 의존성 또는 `supabase/` 폴더 | 2 |
| `uses_firebase` | `boolean` | scanner | `firebase`, `firebase-admin` 의존성 또는 `firebase.json` | 2 |
| `uses_openai` | `boolean` | scanner | `openai` 의존성 또는 `api.openai.com` 호출 | 2 |
| `uses_anthropic` | `boolean` | scanner | `@anthropic-ai/sdk` 의존성 또는 `api.anthropic.com` 호출 | 2 |
| `uses_vercel` | `boolean` | scanner | `vercel.json` 또는 `@vercel/*` 의존성 | 2 |
| `overseas_services` | `string[]` | scanner | `knowledge/kr/services.yaml`의 대응표(패키지·호출 호스트·설정 파일 → 서비스 표시 이름)와 맞는 서비스, 대응표 순서. 대응표는 코드에 두지 않는다 | 3 |
| `payment_sdks` | `{ name: string } & Loc[]` | scanner | `@tosspayments/*`, `@portone/*`, `iamport`, `stripe` 등 의존성·스크립트 | 7 |
| `dependency_audit` | `{ name, version, vulns: string[], suspicious?: "not_found" \| "new" \| "low_downloads" }[]` | adapters/osv | OSV 조회 결과. `--no-network`면 **Fact를 만들지 않는다** | 7 |

## 2. 페이지 (src/scanner/routes)

| 키 | 타입 | 생성 | 설명 | 단계 |
|---|---|---|---|---|
| `pages` | `PageRoute[]` | 라우트 해석기 | 모든 페이지. 설정 파일 > live > 정적 해석 > 푸터 링크 순으로 병합 (같은 path는 우선순위 높은 것 유지) | 4 |
| `footer_links` | `{ text: string; href: string } & Loc[]` | 라우트 해석기 | `<footer>` 안의 링크 | 4 |
| `footer_text` | `string` | 라우트 해석기 | `<footer>` 안 텍스트 전체 (사업자 정보 확인용) | 4 |

해석 규칙
- **next-app**: `app/**/page.{tsx,jsx,ts,js}`. `(group)` 폴더는 주소에서 뺀다. `_` 로 시작하는 폴더, `@slot` 폴더는 제외.
- **next-pages**: `pages/**/*.{tsx,jsx,ts,js}`. `_app`, `_document`, `api/` 제외. `index`는 상위 경로.
- **static-html**: 루트와 `public/`의 `*.html`. `index.html` → `/`, 그 외 `/<이름>.html`.
- **react-router** (7단계): `<Route path>` JSX, `createBrowserRouter([...])`의 `path`.
- 공통 제외: `node_modules`, `.git`, `.next`, `dist`, `build`, `coverage`.

## 3. 개인정보 (src/rules/static)

| 키 | 타입 | 생성 | 설명 | 단계 |
|---|---|---|---|---|
| `personal_forms` | `PersonalForm[]` | `forms` | 개인정보 필드가 하나 이상 있는 폼 | 4 |
| `collects_personal_info` | `boolean` | `forms` | `personal_forms`가 비어 있지 않거나, 회원가입 API 호출(`supabase.auth.signUp`, `createUserWithEmailAndPassword`)이 있음 | 4 |
| `analytics_scripts` | `{ vendor: string } & Loc[]` | `scripts` | `ga4`, `gtm`, `meta_pixel`, `mixpanel`, `kakao_pixel`, `naver_analytics` 등 | 4 |
| `external_embeds` | `{ domain: string; tag: "iframe" \| "script" } & Loc[]` | `scripts` | 외부 도메인 iframe·script. 분석 툴로 이미 분류된 것은 제외 | 4 |

```ts
interface PersonalForm extends Loc {
  fields: { name: string; kind: FieldKind; label?: string } & Loc[];  // label: 화면의 라벨 텍스트
  consent: {
    present: boolean;            // "동의" 라벨이 붙은 체크박스가 하나 이상
    optional_prechecked: boolean; // "선택" 라벨 체크박스가 기본 체크(checked, defaultChecked)
  };
}
type FieldKind = "email" | "phone" | "name" | "birth" | "gender" | "address" | "rrn" | "password" | "other";
```

`kind`는 input의 `type`, `name`, `id`, `autocomplete`, 라벨 텍스트로 정한다. 개인정보 필드는 `other`, `password`를 뺀 나머지다.

## 4. 콘텐츠·UX (src/rules/static)

| 키 | 타입 | 생성 | 설명 | 단계 |
|---|---|---|---|---|
| `visible_text` | `{ text: string } & Loc[]` | `text` | JSX 텍스트 노드, HTML 본문 텍스트 (주석, script, style 제외) | 7 |
| `all_text` | `{ text: string; source: "jsx" \| "string" \| "markdown" \| "html" \| "i18n" \| "live" } & Partial<Loc>[]` | `text` | **사용자에게 보이는 텍스트 전체.** 치명 항목의 흔적 패턴(`trace`) 확인용 (`evidence-dsl.md` 3.3). 수집 범위와 제외 규칙은 아래 4.1 | 4 |
| `buttons` | `{ label: string } & Loc[]` | `text` | `<button>`, `input[type=submit\|button]`, `role="button"`의 라벨. 라벨 없음은 `""` | 7 |
| `review_components` | `Loc[]` | `reviews` | 이름에 review·testimonial·후기가 들어간 컴포넌트 | 7 |
| `hardcoded_reviews` | `{ count: number } & Loc[]` | `reviews` | 후기 컴포넌트 안의 하드코딩 배열(이름 + 별점/본문 필드를 가진 객체 2개 이상) | 7 |

### 4.1 `all_text` 수집 범위

**모으는 것** (주석은 모두 뺀다)

| source | 대상 |
|---|---|
| `jsx` | JSX 텍스트 노드, 사용자에게 보이는 속성 값(`alt`, `title`, `placeholder`, `aria-label`, `label`) |
| `string` | `.ts`·`.tsx`·`.js`·`.jsx`·`.vue`·`.svelte`의 문자열·템플릿 리터럴. 단 import·require·export from 경로, `className`·`class`·`style` 값, 2자 미만은 뺀다 |
| `markdown` | `.md`·`.mdx` 본문 (front matter 제외) |
| `html` | `.html`의 본문 텍스트 (`<script>`·`<style>`·주석 제외), `<title>`, 위 속성 값 |
| `i18n` | 다국어 파일의 문자열 값: `locales/**`, `messages/**`, `i18n/**`, `lang/**` 아래 `.json` (키는 빼고 값만) |
| `live` | `--live` 모드에서 렌더링한 모든 페이지의 본문. 정적 소스에 **더한다** (대체하지 않는다) |

**빼는 것** (공통 제외 + 아래)

| 대상 | 이유 |
|---|---|
| 저장소 최상위 `docs/` | 프로젝트 문서. `app/docs/`, `pages/docs/`, `src/docs/` 같은 실제 라우트는 **포함** |
| 최상위의 `README*`, `CHANGELOG*`, `CONTRIBUTING*`, `LICENSE*` | 서비스 화면이 아님 |
| `*.test.*`, `*.spec.*`, `__tests__/`, `__mocks__/` | 테스트 코드 |
| `fixtures/` | 테스트 데이터 |
| `node_modules`, `.next`, `dist`, `build`, `coverage`, `.git` | 공통 제외 |

## 5. 접근성 (src/rules/static)

| 키 | 타입 | 생성 | 설명 | 단계 |
|---|---|---|---|---|
| `img_missing_alt` | `{ total: number; missing: number; items: Loc[] }` | `images` | `<img>`, next/image `<Image>`. `alt` 속성 없음만 missing (`alt=""`는 장식 이미지로 인정). **이미지가 0개면 Fact를 만들지 않는다** | 4 |

## 6. 보안 (src/rules/static, src/adapters)

| 키 | 타입 | 생성 | 설명 | 단계 |
|---|---|---|---|---|
| `git_tracked` | `string[]` | adapters/git | 수집한 파일 중 git이 추적하는 파일 경로. **git이 없거나 저장소가 아니거나 `git: false`면 Fact를 만들지 않는다** (추적 여부 모름) | 5 |
| `gitignored` | `string[]` | adapters/git / `gitignore` | 수집한 파일 중 무시 규칙에 걸리는 파일 경로. git이 있으면 `git check-ignore`, 없으면 스캔 루트 안의 `.gitignore`들을 직접 해석한다 (fallback) | 5 |
| `env_files` | `{ path: string; gitignored: boolean; git_tracked: boolean \| null }[]` | `secrets` | `.env`, `.env.*` 파일 (`.env.example`, `.env.sample`, `.env.template` 제외). `git_tracked`가 없으면 `null` | 5 |
| `env_files_exposed` | `{ reason: "tracked" \| "not_ignored" } & Loc[]` | `secrets` | `env_files` 중 `git_tracked: true`이거나 `gitignored: false`인 파일. 둘 다면 `tracked` | 5 |
| `secrets_exposed` | `{ rule: string; masked: string; via: "hardcoded" \| "public_env" \| "env_file" } & Loc[]` | `secrets` / adapters/gitleaks | 비밀값 후보. `via`: `hardcoded` = 소스 코드에 직접 씀, `public_env` = 클라이언트에 노출되는 변수(`NEXT_PUBLIC_*`, `VITE_*`)에 비밀값, `env_file` = 그 밖의 `.env` 변수. `NEXT_PUBLIC_SUPABASE_ANON_KEY`, Firebase web `apiKey`처럼 **공개용으로 설계된 키는 제외** | 5 |
| `supabase_migrations` | `string[]` | `supabase` | `supabase/` 아래 `.sql` 파일 경로 (경로순) | 5 |
| `supabase_tables_without_rls` | `{ table: string } & Loc[]` | `supabase` | 마이그레이션 SQL에서 `create table` 후 `enable row level security`가 없는 public 테이블. 여러 파일이면 경로순으로 읽어 마지막 상태(`disable`이 뒤에 오면 꺼짐) | 5 |
| `supabase_from_calls` | `Loc[]` | `supabase` | 코드에서 Supabase 클라이언트로 테이블을 읽고 쓰는 호출 (`.from("테이블")`). `@supabase/*`를 import하거나 `supabase` 식별자를 쓰는 파일만 | 5 |
| `service_role_in_client` | `Loc[]` | `supabase` | 클라이언트 번들 대상 파일에서 service_role 키·변수 사용, 또는 `NEXT_PUBLIC_`·`VITE_` 변수 이름에 `SERVICE_ROLE` | 5 |
| `firebase_open_rules` | `Loc[]` | `firebase` | `firestore.rules`, `storage.rules`, `database.rules.json`의 `if true` / `".read": true` | 5 |
| `dangerous_patterns` | `{ kind: "eval" \| "dangerously_set_inner_html" \| "cors_wildcard" \| "unauth_api_route" } & Loc[]` | `patterns` / adapters/semgrep | 위험 패턴 위치 | 5 |


클라이언트 번들 대상 파일 (`service_role_in_client`)
- `"use client"`가 있는 파일, `components/**`, `pages/**`(`pages/api/**` 제외), Next.js가 아닌 프로젝트의 `src/**`·`.html`.
- 서버 파일은 제외: `app/**/route.*`, `pages/api/**`, `"use server"`가 있는 파일, `*.server.*`, `supabase/functions/**`.

git 추적 규칙
- 파일 수집은 `.gitignore`와 상관없이 모든 파일을 읽는다. 무시 여부는 위 Fact로만 전달한다.
- `git`은 `src/adapters/git`에서만 실행한다 (`git ls-files`, `git check-ignore --stdin`). 사용자 프로젝트의 스크립트는 실행하지 않는다.
- 골든 테스트는 fixture를 임시 폴더에 복사하고 `git init`·commit한 **실제 git 상태**로 실행한다 (fixtures/README.md "fixture 준비"). git 확인을 끄는 옵션은 두지 않는다 (키 노출 검사를 우회하는 스위치가 되므로).
- `security/secret-exposure` 판정 (5단계 YAML):

  | 상황 | 결과 |
  |---|---|
  | `.env`가 `gitignored`이고 추적되지 않음(또는 추적 여부 모름) | 정상 |
  | `.env`가 추적됨, 또는 무시되지 않음 (`env_files_exposed`) | 실패 → 차단 |
  | `secrets_exposed`에 `via: public_env` (`.env`가 무시돼도) | 실패 → 차단 |
  | `secrets_exposed`에 `via: hardcoded` | 실패 → 차단 |
  | `via: env_file`만 있고 그 `.env`가 정상 | 정상 |

## 7. 렌더링 (src/rules/live, `--live` 일 때만)

| 키 | 타입 | 생성 | 설명 | 단계 |
|---|---|---|---|---|
| `axe_violations` | `{ id: string; impact: string; nodes: number; url: string }[]` | `axe` | axe-core 결과 요약 | 6 |
| `contrast_failures` | `{ selector: string; ratio: number; url: string }[]` | `axe` | axe `color-contrast` 위반 | 6 |
| `keyboard_forms` | `{ url: string; total: number; missing: number }` | `keyboard` | Tab만으로 제출 못 한 폼 수 (`img_missing_alt`와 같은 `total/missing` 형태) | 6 |
| `cookies_before_consent` | `{ name: string; domain: string; url: string }[]` | `cookies` | 동의 전 설정된 추적 쿠키 | 6 |

`--live`에서는 `pages`에 `source: "live"` 항목이 추가되고, 각 항목에 렌더링된 본문 `text`가 들어간다.
