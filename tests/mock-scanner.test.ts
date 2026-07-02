import { describe, it, expect } from 'vitest';
import { mockScanner } from '../lib/scanner/mock';
import { DEFAULT_RULES } from '../lib/storage';

describe('mockScanner', () => {
  it('emits one verdict per listing with the index pattern', async () => {
    const batch = ['a', 'b', 'c', 'd'].map((c) => ({ c, company: c, text: c }));
    const got: Record<string, string> = {};
    await mockScanner.scan(batch, DEFAULT_RULES, (v) => { got[v.c] = v.verdict!; });
    expect(got).toEqual({ a: 'aligned', b: 'mixed', c: 'flagged', d: 'neutral' });
  });
});
