import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { z } from "zod";
import { FACT_KEYS } from "../facts.js";
import { KnowledgeError } from "./loader.js";

// 표시 이름 knowledge/kr/labels.yaml (evidence-dsl.md 7장): Fact 경로 → { 값: 표시 이름 }
export type Labels = Record<string, Record<string, string>>;

const labelsSchema = z.record(
  z.string().refine((path) => FACT_KEYS.has(path.split(".")[0]!), { message: "facts.md에 없는 Fact 경로" }),
  z.record(z.string(), z.string().min(1)),
);

export function parseLabels(text: string): Labels {
  let raw: unknown;
  try {
    raw = text.trim() === "" ? {} : load(text);
  } catch (e) {
    throw new KnowledgeError(`labels.yaml을 읽을 수 없습니다 (${(e as Error).message.split("\n")[0]})`);
  }
  const parsed = labelsSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(최상위)"}: ${i.message}`);
    throw new KnowledgeError(`labels.yaml 형식을 확인해 주세요\n${issues.join("\n")}`);
  }
  return parsed.data;
}

export const loadLabels = (file: string): Labels => parseLabels(readFileSync(file, "utf8"));
