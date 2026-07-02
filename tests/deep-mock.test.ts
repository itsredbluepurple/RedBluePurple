import { describe, it, expect } from 'vitest';
import { mockDeep } from '../lib/deep/mock';
import { DEFAULT_RULES } from '../lib/storage';

describe('mockDeep', () => {
  it('returns a populated DeepResult for a company', async () => {
    const r = await mockDeep.research('Northbeam AI', DEFAULT_RULES);
    expect(r.company).toBe('Northbeam AI');
    expect(['aligned', 'flagged', 'mixed', 'neutral']).toContain(r.verdict);
    expect(typeof r.rating).toBe('number');
    expect(r.news.length).toBeGreaterThan(0);
    expect(r.pros.length + r.cons.length).toBeGreaterThan(0);
    expect(r.researchedAt).toBeGreaterThan(0);
  });
});
