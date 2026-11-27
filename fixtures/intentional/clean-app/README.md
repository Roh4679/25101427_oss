# clean-app (오탐 측정용)

Next.js app router + Supabase + Google Analytics로 만든 회원가입 서비스. **일부러 심은 문제가 없다.** 여기서 경고가 나오면 회귀로 본다.

일부러 넣은 "통과해야 하는" 요소:

| 요소 | 위치 | 확인하는 의무 |
|---|---|---|
| route group 안의 처리방침·약관 (`app/(legal)/...`) | `app/(legal)/privacy`, `terms` | 라우트 해석기가 `(legal)`을 주소에서 빼는지 |
| 처리방침 필수 항목(목적·항목·기간·보호책임자) | `app/(legal)/privacy/page.tsx` | `privacy/policy-contents` |
| Supabase 국외 이전 고지 | 같은 파일 4항 | `privacy/overseas-transfer` |
| GA + 쿠키 고지 | `app/layout.tsx`, 처리방침 5항 | `privacy/analytics-disclosure`, `privacy/cookie-consent` |
| 필수 동의 체크박스 (기본 체크 아님) | `app/signup/page.tsx` | `privacy/consent-checkbox` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` 사용 | `lib/supabase.ts` | 공개용 키를 비밀값으로 잡지 않는지 (`security/secret-exposure`) |
| RLS를 켠 테이블 | `supabase/migrations/0001_profiles.sql` | `security/db-access` |
| `.env*`를 무시하는 `.gitignore` | `.gitignore` | `security/secret-exposure` |
| alt가 있는 next/image | `app/page.tsx` | `accessibility/img-alt` |
