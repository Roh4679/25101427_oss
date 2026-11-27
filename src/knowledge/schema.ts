import { z } from "zod";
import type { PatternItem } from "./normalize.js";

// 지식 베이스 YAML 스키마 (docs/spec/evidence-dsl.md). 항목 간 검사는 loader.ts.

const pattern = z.union([z.string(), z.object({ regex: z.string() }).strict()]);
const item = z.union([pattern, z.array(pattern).min(1)]);
const items = z.array(item).min(1);
const itemsOrTrace = z.union([z.literal("$trace"), items]);
const pageKind = z.enum(["privacy", "terms", "refund"]);
const pageRef = z.object({ kind: pageKind.optional(), match: z.array(z.string()).min(1) }).strict();
const factRef = z.string().min(1);
const level = z.number().int().min(1).max(3);

export type Condition = string | { all: Condition[] } | { any: Condition[] } | { not: Condition } | { fact: string; eq: unknown };

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    factRef,
    z.object({ all: z.array(conditionSchema).min(1) }).strict(),
    z.object({ any: z.array(conditionSchema).min(1) }).strict(),
    z.object({ not: conditionSchema }).strict(),
    z.object({ fact: factRef, eq: z.unknown() }).strict(),
  ]),
);

type ItemsOrTrace = "$trace" | PatternItem[];
type TextMatch = { any_of: ItemsOrTrace; all_of?: never } | { all_of: ItemsOrTrace; any_of?: never };
type Mode = { mode?: "live" };

export type Evidence = Mode &
  (
    | { page_exists: { kind?: "privacy" | "terms" | "refund"; match: string[] } }
    | { page_text_contains: { page: { kind?: "privacy" | "terms" | "refund"; match: string[] } } & TextMatch }
    | { truthy: string }
    | { falsy: string }
    | { coverage: string }
    | { text_contains: { fact: string; field?: string } & TextMatch }
    | { text_absent: { fact: string; field?: string; any_of: ItemsOrTrace; exact?: boolean } }
    | { every: { fact: string; field: string } }
    | { none: { fact: string; field: string } }
    | { any: Evidence[] }
  );

// any_of와 all_of 중 정확히 하나
const textMatch = <T extends z.ZodRawShape>(shape: T) =>
  z.union([
    z.object({ ...shape, any_of: itemsOrTrace }).strict(),
    z.object({ ...shape, all_of: itemsOrTrace }).strict(),
  ]);

const mode = z.literal("live").optional();
const ev = <K extends string, V extends z.ZodType>(key: K, value: V) => z.object({ [key]: value, mode } as { [P in K]: V } & { mode: typeof mode }).strict();

export const evidenceSchema: z.ZodType<Evidence> = z.lazy(() =>
  z.union([
    ev("page_exists", pageRef),
    ev("page_text_contains", textMatch({ page: pageRef })),
    ev("truthy", factRef),
    ev("falsy", factRef),
    ev("coverage", factRef),
    ev("text_contains", textMatch({ fact: factRef, field: z.string().optional() })),
    ev("text_absent", z.object({ fact: factRef, field: z.string().optional(), any_of: itemsOrTrace, exact: z.boolean().optional() }).strict()),
    ev("every", z.object({ fact: factRef, field: z.string() }).strict()),
    ev("none", z.object({ fact: factRef, field: z.string() }).strict()),
    ev("any", z.array(evidenceSchema).min(1)),
  ]),
) as z.ZodType<Evidence>;

export const obligationSchema = z
  .object({
    id: z.string().regex(/^[a-z]+\/[a-z0-9-]+$/, "id는 '영역/이름' 형식"),
    category: z.enum(["security", "privacy", "commerce", "advertising", "accessibility", "ux"]),
    check: z.enum(["auto", "semi"]),
    factors: z.object({ L: level, I: level, P: level }).strict(),
    trigger: conditionSchema.optional(),
    trace: items.optional(),
    evidence: z.array(evidenceSchema).min(1),
    depends_on: z.string().optional(),
    parent_hint: z.string().min(1).optional(),
    message: z.string().min(1).optional(),
    fix: z.string().min(1).optional(),
    principle: z
      .object({
        law: z.string().min(1),
        article: z.string().min(1),
        source: z.string().url().nullable(),
        verified_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD").nullable(),
        references: z
          .array(z.object({ candidate: z.string().min(1), basis: z.string().min(1), note: z.string().min(1).optional() }).strict())
          .optional(),
      })
      .strict()
      .optional(),
    technical_reference: z.array(z.object({ name: z.string().min(1), item: z.string().min(1) }).strict()).optional(),
  })
  .strict();

export type Obligation = z.infer<typeof obligationSchema>;

// 조문 미확인 표시 (evidence-dsl.md 9장)
export const ARTICLE_TODO = "TODO-확인필요";

export const knowledgeFileSchema = z.array(obligationSchema);
