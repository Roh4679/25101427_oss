// 3계층이 주고받는 타입. 명세: docs/spec/facts.md, docs/spec/report-schema.md

export type Loc = { file: string; line: number };

export interface PageRoute {
  path: string;
  file?: string;
  external?: string;
  source: "file-route" | "code-route" | "footer-link" | "config" | "live";
  kind?: "privacy" | "terms" | "refund";
  link_text?: string;
  title?: string;
  text?: string;
}

export interface Fact {
  key: string;
  value: unknown;
  location?: { file?: string; line?: number; url?: string };
}

export interface SourceFile {
  path: string; // 프로젝트 루트 기준, `/` 구분자
  content?: string; // 텍스트 파일만 읽는다
}

export interface ScanContext {
  root: string;
  files: SourceFile[];
  mode: "static" | "live";
}

// 탐지 규칙은 사실만 반환한다. 판단·점수는 넣지 않는다.
export interface Detector {
  id: string;
  detect(ctx: ScanContext): Fact[];
}

export type Category = "security" | "privacy" | "commerce" | "advertising" | "accessibility" | "ux";
export type Status = "pass" | "partial" | "needs_review" | "fail" | "na";
export type Verdict = "ready" | "ready_with_fixes" | "needs_work" | "blocked";
export type Grade = "critical" | "high" | "medium" | "low";
export type Factors = { L: number; I: number; P: number };

export interface Finding {
  location?: { file?: string; line?: number; url?: string }; // 있어서 문제
  searched?: { routes: number; footer: string[]; texts: number }; // 없어서 문제 (report-schema.md 5장)
  message: string;
  fix: string;
  aiPrompt?: string;
  legalBasis?: string;
  policyTodo?: { from: string; item: string }[];
}

export interface Result {
  id: string;
  category: Category;
  check: "auto" | "semi";
  status: Status;
  score: number | null;
  factors: Factors;
  risk: number;
  grade: Grade;
  weight: number;
  mitigated: boolean;
  confirmed: boolean;
  naReason?: "trigger" | "disabled" | "mode" | "dependency";
  message?: string;
  fix?: string;
  principle?: { law: string; article: string; source: string; verified_at: string };
  configPage?: { url: string; verified: boolean; httpStatus?: number };
  findings: Finding[];
}

export interface ScoreSummary {
  total: number;
  verdict: Verdict;
  blockers: string[];
  categories: Record<Category, number | null>;
}

export interface Report {
  schemaVersion: 1;
  tool: { name: "vibe-signoff"; version: string };
  project: { name: string; framework: string };
  options: { mode: "static" | "live"; liveUrl?: string; network: boolean; region: "kr" | "global" };
  score: ScoreSummary;
  results: Result[];
  disclaimer: string;
}
