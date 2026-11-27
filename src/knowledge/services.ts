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

export type Service = z.infer<typeof serviceSchema>;

export function parseServices(text: string): Service[] {
  let raw: unknown;
  try {
    raw = text.trim() === "" ? [] : load(text);
  } catch (e) {
    throw new KnowledgeError(`services.yaml을 읽을 수 없습니다 (${(e as Error).message.split("\n")[0]})`);
  }
  const parsed = z.array(serviceSchema).safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(최상위)"}: ${i.message}`);
    throw new KnowledgeError(`services.yaml 형식을 확인해 주세요\n${issues.join("\n")}`);
  }
  return parsed.data;
}

export const loadServices = (file: string): Service[] => parseServices(readFileSync(file, "utf8"));
