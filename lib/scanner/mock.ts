import type { Scanner, ScanInput, Rules, CompanyVerdict, Verdict } from '../types';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PATTERN: Verdict[] = ['aligned', 'mixed', 'flagged', 'neutral'];

// Test-only dry-run: verdict by index so every state is visible; the production
// runtime never uses this (no key/prompt → nudge).
export const mockScanner: Scanner = {
  async scan(batch: ScanInput[], _rules: Rules, onResult: (v: CompanyVerdict) => void) {
    for (let i = 0; i < batch.length; i++) {
      await delay(120);
      const verdict = PATTERN[i % 4];
      onResult({ c: batch[i].c, verdict, reason: `mock ${verdict}` });
    }
  },
};
