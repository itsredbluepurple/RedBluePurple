import { describe, it, expect } from 'vitest';
import { VERDICT_LABEL, isVerdict } from '../lib/verdict';

describe('VERDICT_LABEL', () => {
  it('labels are title-case', () => {
    expect(VERDICT_LABEL.mixed).toBe('Mixed');
    expect(VERDICT_LABEL.aligned).toBe('Aligned');
    expect(VERDICT_LABEL.flagged).toBe('Flagged');
    expect(VERDICT_LABEL.neutral).toBe('Neutral');
  });
});

describe('isVerdict', () => {
  it('accepts the four verdicts and rejects anything else', () => {
    for (const v of ['aligned', 'flagged', 'mixed', 'neutral']) expect(isVerdict(v)).toBe(true);
    expect(isVerdict('none')).toBe(false);
    for (const v of ['blue', '', 0, null, undefined, {}]) expect(isVerdict(v as unknown)).toBe(false);
  });
});
