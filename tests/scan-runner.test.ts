import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chunk, validateScanBatch, validateRules, runScan } from '../lib/scanner/runner';
import { DEFAULT_RULES } from '../lib/storage';
import type { Scanner, ScanInput, CompanyVerdict } from '../lib/types';

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const mk = (n: number): ScanInput[] =>
  Array.from({ length: n }, (_, i) => ({ c: String(i), company: `Co ${i}`, text: 'sales role' }));

describe('chunk', () => {
  it('splits into groups of size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it('empty input yields no chunks', () => {
    expect(chunk([], 2)).toEqual([]);
  });
});

describe('validateScanBatch', () => {
  it('accepts a well-formed non-empty batch', () => {
    expect(validateScanBatch(mk(2))).toBe(true);
  });
  it('rejects empty, non-array, and malformed items', () => {
    expect(validateScanBatch([])).toBe(false);
    expect(validateScanBatch(null)).toBe(false);
    expect(validateScanBatch([{ c: '0', company: 'x' }])).toBe(false); // missing text
    expect(validateScanBatch([{ c: 0, company: 'x', text: 'y' }])).toBe(false); // c not string
  });
});

describe('validateRules', () => {
  it('accepts a well-formed rules object', () => {
    expect(validateRules({ prompt: 'x', apiKey: 'k' })).toBe(true);
  });
  it('rejects null and wrong-typed fields', () => {
    expect(validateRules(null)).toBe(false);
    expect(validateRules({ prompt: 5, apiKey: 'k' })).toBe(false);
    expect(validateRules({ prompt: 'x', apiKey: 5 })).toBe(false);
  });
});

describe('runScan failure isolation', () => {
  it('emits every verdict when all chunks succeed', async () => {
    const scanner: Scanner = {
      async scan(batch, _rules, onResult) {
        for (const b of batch) onResult({ c: b.c, verdict: 'aligned', reason: 'x' });
      },
    };
    const verdicts: CompanyVerdict[] = [];
    const errors: string[][] = [];
    await runScan(scanner, mk(20), DEFAULT_RULES, {
      verdict: (v) => verdicts.push(v),
      chunkError: (ids) => errors.push(ids),
    });
    expect(verdicts).toHaveLength(20);
    expect(errors).toHaveLength(0);
  });

  it('drops only the failing chunk and keeps the rest running', async () => {
    // 20 companies, chunk size 8 -> chunks [0-7], [8-15], [16-19].
    // Fail whenever the chunk contains company "8" (the second chunk).
    const scanner: Scanner = {
      async scan(batch, _rules, onResult) {
        if (batch.some((b) => b.c === '8')) throw new Error('Anthropic HTTP 429');
        for (const b of batch) onResult({ c: b.c, verdict: 'aligned', reason: 'x' });
      },
    };
    const verdicts: CompanyVerdict[] = [];
    const errorIds: string[] = [];
    await runScan(scanner, mk(20), DEFAULT_RULES, {
      verdict: (v) => verdicts.push(v),
      chunkError: (ids, reason) => {
        errorIds.push(...ids);
        expect(reason).toMatch(/429/);
      },
    });
    // first chunk (0-7) and third chunk (16-19) resolved = 12 verdicts
    expect(verdicts.map((v) => v.c).sort((a, b) => +a - +b)).toEqual(
      ['0', '1', '2', '3', '4', '5', '6', '7', '16', '17', '18', '19'],
    );
    // the failed middle chunk's 8 ids are reported, not silently lost
    expect(errorIds.sort((a, b) => +a - +b)).toEqual(['8', '9', '10', '11', '12', '13', '14', '15']);
  });
});
