// docs/spec/facts.md에 정의된 Fact 키. 여기 없는 키는 만들지도, 지식 베이스에서 참조하지도 않는다.
// facts.test.ts가 facts.md와 같은지 확인한다.
export const FACT_KEYS = new Set([
  // 1. 프로젝트
  "scan_mode", "framework", "dependencies",
  "uses_supabase", "uses_firebase", "uses_openai", "uses_anthropic", "uses_vercel",
  "overseas_services", "payment_sdks", "dependency_audit",
  // 2. 페이지
  "pages", "footer_links", "footer_text",
  // 3. 개인정보
  "personal_forms", "collects_personal_info", "analytics_scripts", "external_embeds",
  // 4. 콘텐츠·UX
  "visible_text", "all_text", "buttons", "review_components", "hardcoded_reviews",
  // 5. 접근성
  "img_missing_alt",
  // 6. 보안
  "git_tracked", "gitignored", "env_files", "env_files_exposed", "secrets_exposed",
  "supabase_tables_without_rls", "service_role_in_client", "firebase_open_rules", "dangerous_patterns",
  // 7. 렌더링
  "axe_violations", "contrast_failures", "keyboard_forms", "cookies_before_consent",
]);
