export type Group = 'personal' | 'dev' | 'sensitive';
export type Severity = 'high' | 'medium' | 'low' | 'info';
export type Confidence = 'certain' | 'estimated';

export interface MatchContext {
  text: string;
  start: number;
  end: number;
}

export interface Override {
  confidence?: Confidence;
  severity?: Severity;
  label?: string;
}

export interface Rule {
  id: string;
  label: string;
  group: Group;
  severity: Severity;
  /** A named group `v` narrows the finding to that part of the match. */
  pattern: RegExp;
  confidence?: Confidence;
  /** false drops the candidate; an object adjusts it. */
  validate?: (value: string, ctx: MatchContext) => boolean | Override;
  /** null: warn only, never masked. */
  maskToken: string | null;
  why: string;
  action?: string;
}

export interface Finding {
  ruleId: string;
  label: string;
  group: Group;
  severity: Severity;
  confidence: Confidence;
  start: number;
  end: number;
  value: string;
  maskToken: string | null;
  why: string;
  action?: string;
  source: 'rule' | 'ai';
}
