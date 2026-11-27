import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";

// signoff.config.json 스키마 (docs/spec/cli.md 3장). 모르는 키는 오류.
const level = z.number().int().min(1).max(3);

export const configSchema = z
  .object({
    region: z.enum(["kr", "global"]).optional(),
    weightMode: z.enum(["grade", "raw"]).optional(),
    factors: z.record(z.string(), z.object({ L: level, I: level, P: level }).strict()).optional(),
    disable: z.array(z.string()).optional(),
    pages: z
      .object({
        privacyPolicy: z.string().min(1),
        terms: z.string().min(1),
        refundPolicy: z.string().min(1),
      })
      .partial()
      .strict()
      .optional(),
    confirmations: z.record(z.string(), z.enum(["pass", "fail"])).optional(),
    ignorePaths: z.array(z.string()).optional(),
  })
  .strict();

export type Config = z.infer<typeof configSchema>;

export class UserError extends Error {}

// 파일이 없으면 빈 설정. 직접 지정한 파일이 없으면 오류.
export function loadConfig(file: string, explicit: boolean): Config {
  if (!existsSync(file)) {
    if (explicit) throw new UserError(`설정 파일이 없습니다: ${file}`);
    return {};
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new UserError(`설정 파일을 JSON으로 읽을 수 없습니다: ${file}`);
  }
  return parseConfig(raw, file);
}

export function parseConfig(raw: unknown, file = "signoff.config.json"): Config {
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(최상위)"}: ${i.message}`);
    throw new UserError(`설정 파일 형식을 확인해 주세요: ${file}\n${issues.join("\n")}`);
  }
  return parsed.data;
}
