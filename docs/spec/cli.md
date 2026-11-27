# CLI 명세

## 1. 명령

```bash
vibe-signoff scan [dir]            # 기본 dir = 현재 폴더
vibe-signoff checklist [dir]       # 수동 체크리스트 (점수 제외)
vibe-signoff fix --rule <id> [dir] # 해당 의무의 AI 수정 프롬프트 출력
vibe-signoff explain <id>          # 법적 근거, L·I·P와 가중치 근거 출력
vibe-signoff knowledge --stale <일> # verified_at이 N일보다 오래된 항목 목록
```

## 2. scan 옵션

| 옵션 | 기본 | 설명 |
|---|---|---|
| `--live <url>` | 없음 | 렌더링 검사. 이 URL과 같은 origin의 링크만 따라간다. 최대 20페이지 |
| `--no-network` | 꺼짐 | OSV 조회 등 모든 외부 요청을 끈다. `--live`의 대상 URL 접속은 예외 |
| `--ai` | 꺼짐 | LLM 의미 검사 (기획서 4.6). 켤 때 무엇을 보내는지 먼저 출력한다 |
| `--region <kr\|global>` | `kr` | 지역 기준 (쿠키 동의 등) |
| `--format <terminal\|json\|markdown\|html\|sarif>` | `terminal` | 리포트 형식 |
| `--output <file>` | 표준 출력 | 리포트 저장 경로 |
| `--config <file>` | `<dir>/signoff.config.json` | 설정 파일 |

명령줄 옵션이 설정 파일보다 우선한다.

## 3. 설정 파일 `signoff.config.json`

zod로 검증한다. 모르는 키는 오류(종료 코드 2).

```jsonc
{
  "region": "kr",
  "weightMode": "grade",          // "grade": 등급 가중치 10/5/3/1, "raw": L×I×P 값 그대로
  "factors": {                    // 의무별 L·I·P 덮어쓰기
    "ux/button-labels": { "L": 1, "I": 1, "P": 2 }
  },
  "disable": ["advertising/unsupported-claims"],  // 끈 의무는 N/A로 표시하고 이유를 남김
  "pages": {                      // 페이지 직접 지정 (가장 우선)
    "privacyPolicy": "https://example.notion.site/privacy",
    "terms": "/terms",
    "refundPolicy": "/refund"
  },
  "confirmations": {              // 반자동 항목을 사람이 확인한 결과
    "privacy/minimal-collection": "pass"
  },
  "ignorePaths": ["legacy/**"]
}
```

- `pages` 값은 `PageRoute { source: "config", kind }`로 들어간다 (`privacyPolicy` → `privacy`, `terms` → `terms`, `refundPolicy` → `refund`).
- `confirmations`는 `check: semi`이거나 치명(critical) 등급인 의무에만 쓸 수 있다. 그 외 의무에 쓰면 경고만 하고 무시한다. `fail`이면 차단, `pass`면 통과로 확정된다 ([docs/scoring.md](../scoring.md) 3장).

## 4. 종료 코드

| 코드 | 의미 |
|---|---|
| 0 | `ready`(배포 가능) 또는 `ready_with_fixes`(보완 후 배포 권장) |
| 1 | `needs_work`(보완 필요) 또는 `blocked`(배포 차단) |
| 2 | 실행 오류 (설정 파일 오류, 지식 베이스 스키마 오류, 폴더 없음 등) |

`checklist`, `fix`, `explain`, `knowledge`는 성공 시 0, 오류 시 2.

## 5. 출력 원칙

- 모든 메시지는 한국어. "위법·불법·위반입니다" 대신 "확인 필요", "~가 보이지 않습니다".
- 비밀값은 앞 4자 + `****`.
- 리포트 끝에 면책 문구: "이 결과는 자동으로 확인 가능한 항목의 통과 여부이며, 법률 자문이 아니고 법적·보안적 완전성을 보장하지 않습니다."
