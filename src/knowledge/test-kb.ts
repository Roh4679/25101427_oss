// 테스트 전용 지식 베이스. docs/spec/evidence-dsl.md 5장 예시를 옮긴 것이다 (실제 지식 베이스가 아님).
// 메시지·조문은 실제 YAML(4단계 이후)에서 확정한다.
import { parseKnowledge } from "./loader.js";

export const TEST_KB_YAML = String.raw`
- id: privacy/policy-page
  category: privacy
  check: auto
  factors: { L: 3, I: 2, P: 3 }
  trigger: collects_personal_info
  trace: ["개인정보처리방침", "privacy policy"]
  evidence:
    - page_exists: { kind: privacy, match: ["privacy", "개인정보처리방침"] }
  message: 개인정보 처리방침이 보이지 않습니다.
  fix: 처리방침 페이지를 만들고 모든 페이지 하단에 링크하세요.

- id: privacy/policy-contents
  category: privacy
  check: semi
  factors: { L: 3, I: 2, P: 2 }
  trigger: collects_personal_info
  depends_on: privacy/policy-page
  parent_hint: "수집 항목: {personal_forms.fields.kind}"
  evidence:
    - page_text_contains:
        page: { kind: privacy, match: ["privacy", "개인정보처리방침"] }
        all_of: [["처리목적", "이용목적"], "보유기간", "보호책임자"]
  message: 처리방침 필수 항목(목적·보유기간·보호책임자)이 보이지 않습니다.
  fix: 테스트용 해결 방법.

- id: privacy/overseas-transfer
  category: privacy
  check: semi
  factors: { L: 3, I: 2, P: 2 }
  trigger: { all: [collects_personal_info, overseas_services] }
  depends_on: privacy/policy-page
  parent_hint: "해외 서버로 이전될 수 있음: {overseas_services}"
  evidence:
    - page_text_contains:
        page: { kind: privacy, match: ["privacy", "개인정보처리방침"] }
        any_of: ["국외이전"]
  message: 처리방침에 국외 이전 안내가 보이지 않습니다.
  fix: 테스트용 해결 방법.

- id: privacy/analytics-disclosure
  category: privacy
  check: auto
  factors: { L: 3, I: 2, P: 2 }
  trigger: analytics_scripts
  depends_on: privacy/policy-page
  parent_hint: "분석 도구: {analytics_scripts.vendor}"
  evidence:
    - page_text_contains:
        page: { kind: privacy, match: ["privacy", "개인정보처리방침"] }
        any_of: [["google analytics", "구글 애널리틱스"]]
  message: 처리방침에 분석 도구 사용 안내가 보이지 않습니다.
  fix: 테스트용 해결 방법.

- id: privacy/consent-checkbox
  category: privacy
  check: auto
  factors: { L: 3, I: 2, P: 3 }
  trigger: collects_personal_info
  evidence:
    - every: { fact: personal_forms, field: consent.present }
    - none: { fact: personal_forms, field: consent.optional_prechecked }
  message: 동의 체크박스가 없거나 선택 동의가 미리 체크되어 있습니다.
  fix: 테스트용 해결 방법.

- id: privacy/cookie-consent
  category: privacy
  check: semi
  factors: { L: 2, I: 2, P: 3 }
  trigger: analytics_scripts
  depends_on: privacy/policy-page
  parent_hint: "쿠키 사용 사실과 거부 방법"
  evidence:
    - page_text_contains:
        page: { kind: privacy, match: ["privacy", "개인정보처리방침"] }
        any_of: ["쿠키"]
  message: 처리방침에 쿠키 사용·거부 방법 안내가 보이지 않습니다.
  fix: 테스트용 해결 방법.

- id: privacy/cookie-before-consent
  category: privacy
  check: auto
  factors: { L: 2, I: 2, P: 3 }
  trigger: analytics_scripts
  evidence:
    - falsy: cookies_before_consent
      mode: live
  message: 동의 전에 추적 쿠키가 설정됩니다.
  fix: 테스트용 해결 방법.

- id: commerce/business-info
  category: commerce
  check: semi
  factors: { L: 3, I: 2, P: 3 }
  trigger: payment_sdks
  trace: ["사업자등록번호", "통신판매업", { regex: '\d{3}-\d{2}-\d{5}' }]
  evidence:
    - text_contains:
        fact: all_text
        field: text
        all_of:
          - ["상호"]
          - ["대표자", "대표"]
          - ["사업자등록번호", { regex: '\d{3}-\d{2}-\d{5}' }]
          - ["통신판매업"]
  message: 사업자 정보(상호·대표자·사업자등록번호·통신판매업)가 모두 보이지 않습니다.
  fix: 테스트용 해결 방법.

- id: commerce/refund-policy
  category: commerce
  check: semi
  factors: { L: 3, I: 2, P: 3 }
  trigger: payment_sdks
  trace: ["청약철회", "환불정책", "환불규정", "환불안내", "취소·환불", "교환·반품", "교환/반품", "반품안내"]
  evidence:
    - any:
        - page_exists: { kind: refund, match: ["refund", "환불정책", "환불규정", "청약철회"] }
        - text_contains: { fact: pages, field: text, any_of: $trace }
        - text_contains: { fact: footer_text, any_of: $trace }
  message: 청약철회(환불) 기간·방법 안내가 보이지 않습니다.
  fix: >-
    약관, 결제 화면 또는 푸터에 청약철회(환불) 기간·방법을 적으세요.
    이미 다른 곳(외부 페이지 등)에 안내하고 있다면 signoff.config.json의 pages.refundPolicy에 주소를 지정하거나,
    직접 확인한 뒤 confirmations에 "commerce/refund-policy": "pass"를 적으세요.

- id: legal/terms-page
  category: ux
  check: auto
  factors: { L: 1, I: 2, P: 3 }
  trace: ["이용약관", "terms of service"]
  evidence:
    - page_exists: { kind: terms, match: ["terms", "이용약관"] }
  message: 이용약관 페이지가 보이지 않습니다.
  fix: 테스트용 해결 방법.

- id: ux/button-labels
  category: ux
  check: semi
  factors: { L: 1, I: 1, P: 3 }
  evidence:
    - text_absent: { fact: buttons, field: label, exact: true, any_of: ["", "클릭", "여기", "확인", "버튼", "click", "here"] }
  message: 무엇을 하는지 알 수 없는 버튼 문구가 있습니다.
  fix: 테스트용 해결 방법.
`;

export const testKb = () => parseKnowledge([["test.yaml", TEST_KB_YAML]]);
