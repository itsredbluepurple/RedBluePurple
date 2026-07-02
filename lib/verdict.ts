import type { Verdict } from './types';

const VERDICTS: readonly Verdict[] = ['aligned', 'flagged', 'mixed', 'neutral'];
export function isVerdict(x: unknown): x is Verdict {
  return typeof x === 'string' && (VERDICTS as readonly string[]).includes(x);
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  aligned: 'Aligned',
  flagged: 'Flagged',
  mixed: 'Mixed',
  neutral: 'Neutral',
};
