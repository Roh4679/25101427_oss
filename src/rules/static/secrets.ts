import { envNameIn, type EnvNames } from "../../knowledge/services.js";
import { isCodeFile, isHtmlFile, lex, lineIndex } from "../../scanner/source.js";
import type { Detector, SourceFile } from "../../types.js";

// 키 노출 (docs/spec/facts.md 6장): env_files, env_files_exposed, secrets_exposed.
// 비밀값 원문은 Fact에 넣지 않는다. 앞 4자 + **** 만 남긴다 (CLAUDE.md 도구 자체의 보안).

export const mask = (value: string) => `${value.slice(0, 4)}****`;

// 값 형식으로 알아보는 비밀값. 공개용 키(Supabase anon, Firebase web apiKey "AIza…")는 넣지 않는다.
const VALUE_RULES: { rule: string; re: RegExp }[] = [
  { rule: "anthropic-api-key", re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { rule: "openai-api-key", re: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/ },
  { rule: "stripe-secret-key", re: /(?:sk|rk)_live_[A-Za-z0-9]{16,}/ },
  { rule: "aws-access-key-id", re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { rule: "github-token", re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { rule: "private-key", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  // 이름과 무관하게: 주소 안의 "://아이디:비밀번호@" (DB 접속 주소 등)
  { rule: "credentials-in-url", re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@'"`]+:[^\s@/'"`]+@/i },
];

// 변수 이름으로 알아보는 비밀값 (.env). 공개용 이름은 services.yaml env_names.public에서 뺀다.
const SECRET_NAME = /SECRET|SERVICE_ROLE|PRIVATE_KEY|API_KEY|ACCESS_TOKEN|AUTH_TOKEN|PASSWORD|DATABASE_URL/i;
const CLIENT_PREFIX = /^(?:NEXT_PUBLIC_|VITE_|REACT_APP_|EXPO_PUBLIC_)/;

const EXAMPLE_ENV = /(?:^|\/)\.env\.(?:example|sample|template)$/;
export const isEnvFile = (path: string) => /(?:^|\/)\.env(?:\.[^/]+)?$/.test(path) && !EXAMPLE_ENV.test(path);

const valueRule = (v: string) => VALUE_RULES.find((r) => r.re.test(v));

type Secret = { rule: string; masked: string; via: "hardcoded" | "public_env" | "env_file"; file: string; line: number };

function envVars(f: SourceFile): { name: string; value: string; line: number }[] {
  return (f.content ?? "").split(/\r?\n/).flatMap((raw, i) => {
    const m = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) return [];
    const value = m[2]!.trim().replace(/^(['"])(.*)\1$/, "$2");
    return value ? [{ name: m[1]!, value, line: i + 1 }] : [];
  });
}

function envSecrets(f: SourceFile, names: EnvNames): Secret[] {
  return envVars(f).flatMap(({ name, value, line }) => {
    const byValue = valueRule(value);
    // 값이 비밀값 형식이면 이름과 무관하게, 아니면 이름으로 (공개용·제한 필요 이름은 제외)
    const byName = SECRET_NAME.test(name) && !envNameIn(name, names.public) && !envNameIn(name, names.restricted);
    if (!byValue && !byName) return [];
    const via = CLIENT_PREFIX.test(name) ? "public_env" : "env_file";
    return [{ rule: byValue?.rule ?? `env:${name}`, masked: mask(value), via, file: f.path, line }];
  });
}

// 코드·HTML의 문자열 리터럴에 직접 쓴 비밀값 (값 형식으로만 판단)
function hardcodedSecrets(f: SourceFile): Secret[] {
  const src = f.content ?? "";
  const line = lineIndex(src);
  const strings = isCodeFile(f.path) ? lex(src).strings : [...src.matchAll(/(["'])([^"'\n]*)\1/g)].map((m) => ({ value: m[2]!, start: m.index }));
  return strings.flatMap((s) => {
    const r = valueRule(s.value);
    const hit = r && s.value.match(r.re)![0];
    return r && hit ? [{ rule: r.rule, masked: mask(hit), via: "hardcoded" as const, file: f.path, line: line(s.start) }] : [];
  });
}

export function secretsDetector(git: { tracked?: string[]; ignored: (path: string) => boolean }, names: EnvNames): Detector {
  return {
    id: "secrets",
    detect(ctx) {
      const tracked = git.tracked ? new Set(git.tracked) : undefined;
      const envs = ctx.files.filter((f) => isEnvFile(f.path));
      const env_files = envs.map((f) => ({ path: f.path, gitignored: git.ignored(f.path), git_tracked: tracked ? tracked.has(f.path) : null }));
      const env_files_exposed = env_files.flatMap((e) =>
        e.git_tracked === true ? [{ reason: "tracked", file: e.path, line: 1 }] : !e.gitignored ? [{ reason: "not_ignored", file: e.path, line: 1 }] : [],
      );
      const code = ctx.files.filter((f) => f.content !== undefined && (isCodeFile(f.path) || isHtmlFile(f.path)));
      const secrets_exposed = [...envs.flatMap((f) => envSecrets(f, names)), ...code.flatMap(hardcodedSecrets)];
      const public_keys_needing_restriction = envs.flatMap((f) =>
        envVars(f)
          .filter((v) => envNameIn(v.name, names.restricted))
          .map((v) => ({ name: v.name, file: f.path, line: v.line })),
      );
      return [
        { key: "public_keys_needing_restriction", value: public_keys_needing_restriction },
        { key: "env_files", value: env_files },
        { key: "env_files_exposed", value: env_files_exposed },
        { key: "secrets_exposed", value: secrets_exposed },
      ];
    },
  };
}
