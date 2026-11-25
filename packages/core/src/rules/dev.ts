import type { Rule } from '../types.ts';
import { entropy, isPlaceholder } from '../validators/index.ts';

const REVOKE = '코드에서 지우는 것만으로는 부족합니다. 이미 노출됐을 수 있으니 먼저 키를 폐기하고 새로 발급하세요.';
const secret = (id: string, label: string, pattern: RegExp, extra: Partial<Rule> = {}): Rule => ({
  id,
  label,
  pattern,
  group: 'dev',
  severity: 'high',
  maskToken: '시크릿',
  why: '이 값만 있으면 다른 사람이 내 계정이나 서비스를 쓸 수 있습니다.',
  action: REVOKE,
  ...extra,
});
const notExample = (v: string) => !/example|sample|dummy|x{6,}|0{8,}|1234567/i.test(v);

const PRIVATE_IP = /^(?:10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;

export const devRules: Rule[] = [
  secret('aws-access-key', 'AWS 액세스 키', /(?<![A-Z0-9])(?:AKIA|ASIA)[0-9A-Z]{16}(?![A-Z0-9])/, { validate: notExample }),
  secret('aws-secret-key', 'AWS 시크릿 키', /aws_secret_access_key["']?\s*[:=]\s*["']?(?<v>[A-Za-z0-9/+=]{40})(?![A-Za-z0-9/+=])/i, {
    validate: notExample,
  }),
  secret('anthropic-key', 'Anthropic API 키', /(?<![\w-])sk-ant-[A-Za-z0-9_-]{20,}/, { validate: notExample }),
  secret('openai-key', 'OpenAI API 키', /(?<![\w-])sk-(?!ant-)(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/, {
    validate: (v) => notExample(v) && entropy(v) > 3,
  }),
  secret('github-token', 'GitHub 토큰', /(?<!\w)(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/, { validate: notExample }),
  secret('slack-token', 'Slack 토큰', /(?<!\w)xox[baprs]-[A-Za-z0-9-]{10,}/, { validate: notExample }),
  secret('google-api-key', 'Google API 키', /(?<![\w-])AIza[0-9A-Za-z_-]{35}(?![\w-])/, { validate: notExample }),
  secret('stripe-key', 'Stripe 키', /(?<!\w)(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}/, {
    validate: (v) => notExample(v) && (v.includes('_test_') ? { severity: 'low' } : true),
  }),
  secret('jwt', 'JWT 토큰', /(?<![\w-])eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, { severity: 'medium' }),
  secret('bearer', 'Bearer 토큰', /\bBearer\s+(?<v>[A-Za-z0-9._~+/-]{20,}=*)/, {
    severity: 'medium',
    validate: (v) => !isPlaceholder(v) && entropy(v) > 3,
  }),
  secret('private-key', '개인 키', /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z]+ )*PRIVATE KEY-----/),
  secret('url-password', 'URL 속 비밀번호', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:(?<v>[^\s:/@]+)@/i, {
    validate: (v) => !isPlaceholder(v),
  }),
  secret(
    'password-config',
    '비밀번호·시크릿 설정값',
    /(?<![A-Za-z])(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key)["']?\s*[:=]\s*["']?(?<v>[^\s"'`,;]{4,})/i,
    {
      validate: (v) => {
        if (isPlaceholder(v) || !notExample(v)) return false;
        return entropy(v) >= 3 ? true : { confidence: 'estimated', severity: 'medium' };
      },
    },
  ),
  {
    id: 'ip',
    label: 'IP 주소',
    group: 'dev',
    severity: 'low',
    pattern: /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\d.])/,
    validate: (v) => (PRIVATE_IP.test(v) ? { severity: 'info', label: '내부 IP 주소' } : { label: '공인 IP 주소' }),
    maskToken: 'IP',
    why: '공인 IP는 대략적인 위치나 서버를 알려 줄 수 있습니다.',
  },
  {
    id: 'mac',
    label: 'MAC 주소',
    group: 'dev',
    severity: 'low',
    pattern: /(?<![0-9A-Fa-f:-])(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}(?![0-9A-Fa-f:-])/,
    maskToken: 'MAC',
    why: '기기를 고유하게 식별할 수 있습니다.',
  },
];
