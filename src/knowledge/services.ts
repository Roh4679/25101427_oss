import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { z } from "zod";
import { KnowledgeError } from "./loader.js";

// 서비스 대응표 knowledge/kr/services.yaml (docs/spec/evidence-dsl.md 6장)
const serviceSchema = z
  .object({
    name: z.string().min(1),
    packages: z.array(z.string().min(1)).optional(),
    hosts: z.array(z.string().min(1)).optional(),
    files: z.array(z.string().min(1)).optional(),
  })
  .strict()
  .refine((s) => (s.packages?.length ?? 0) + (s.hosts?.length ?? 0) + (s.files?.length ?? 0) > 0, {
    message: "packages·hosts·files 중 하나 이상이 필요합니다",
  });

const envName = z.string().regex(/^[A-Z][A-Z0-9_]*$/, "대문자·숫자·_ 로 된 변수 이름");

const fileSchema = z
  .object({
    services: z.array(serviceSchema),
    // 환경 변수 이름 (클라이언트 접두사 NEXT_PUBLIC_·VITE_ 등을 뗀 뒤 비교)
    env_names: z
      .object({
        public: z.array(envName), // 공개용으로 설계된 키: 비밀값으로 보지 않는다
        restricted: z.array(envName), // 공개되지만 사용 제한(허용 도메인 등)이 필요한 키: 확인 필요
      })
      .strict(),
    // 동의 전 추적 쿠키로 볼 쿠키 이름 패턴 (* = 아무 글자)
    tracking_cookies: z.array(z.string().min(1)),
  })
  .strict();

export type Service = z.infer<typeof serviceSchema>;
export type ServicesFile = z.infer<typeof fileSchema>;
export type EnvNames = ServicesFile["env_names"];

export const cookieMatcher = (patterns: string[]) => {
  const res = patterns.map((p) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`));
  return (name: string) => res.some((r) => r.test(name));
};

export function parseServices(text: string): ServicesFile {
  let raw: unknown;
  try {
    raw = text.trim() === "" ? {} : load(text);
  } catch (e) {
    throw new KnowledgeError(`services.yaml을 읽을 수 없습니다 (${(e as Error).message.split("\n")[0]})`);
  }
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(최상위)"}: ${i.message}`);
    throw new KnowledgeError(`services.yaml 형식을 확인해 주세요\n${issues.join("\n")}`);
  }
  return parsed.data;
}

export const loadServices = (file: string): ServicesFile => parseServices(readFileSync(file, "utf8"));

// NEXT_PUBLIC_FIREBASE_API_KEY → FIREBASE_API_KEY 와 같거나 "_FIREBASE_API_KEY"로 끝나면 일치
const CLIENT_PREFIX = /^(?:NEXT_PUBLIC_|VITE_|REACT_APP_|EXPO_PUBLIC_|NUXT_PUBLIC_|PUBLIC_)/;
export const envNameIn = (name: string, list: string[]) => {
  const bare = name.replace(CLIENT_PREFIX, "");
  return list.some((n) => bare === n || bare.endsWith(`_${n}`));
};
