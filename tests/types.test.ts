import { describe, it } from 'vitest';
import type { Rules, CompanyVerdict } from '../lib/types';

describe('type shapes', () => {
  it('Rules and CompanyVerdict accept their required fields', () => {
    // Compile-time shape check — if the interface contracts change, this will fail to compile.
    const _rules: Rules = { prompt: 'find product roles in B2B SaaS', apiKey: 'sk-ant-x' };
    const _cv: CompanyVerdict = { c: '1', verdict: 'aligned', reason: 'good fit' };
    void _rules; void _cv; // suppress unused-variable warnings
  });
});
