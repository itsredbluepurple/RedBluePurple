export type Verdict = 'aligned' | 'flagged' | 'mixed' | 'neutral';

export interface Rules {
  prompt: string;          // natural-language "what I want / what to avoid"
  apiKey: string;          // BYO Anthropic key
}

export interface ScanInput {
  c: string;             // stable listing id assigned by the content script
  company: string;       // company name text
  text: string;          // trimmed listing text sent to the model
}

export interface CompanyVerdict {
  c: string;
  verdict: Verdict;        // model-decided (Tier-1)
  reason: string;          // one short line; badge hover title
}

export interface DeepResult {
  company: string;
  rating: number | null;
  size: string | null;
  news: string[];
  pros: string[];   // evidence FOR the user's criteria
  cons: string[];   // evidence AGAINST
  researchedAt: number;  // epoch ms
  verdict?: Verdict;     // absent = research failed / no re-judgement — never re-color
}

export interface Scanner {
  scan(
    batch: ScanInput[],
    rules: Rules,
    onResult: (v: CompanyVerdict) => void,
  ): Promise<void>;
}

export interface DeepResearcher {
  research(company: string, rules: Rules): Promise<DeepResult>;
}
