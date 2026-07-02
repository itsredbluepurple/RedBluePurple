import { describe, it, expect, vi } from 'vitest';
import { buildRequest, extractVerdicts, accumulateToolJson } from '../lib/scanner/haiku';

const RULES = { prompt: 'Want B2B SaaS product roles; avoid recent layoffs.', apiKey: 'sk-ant-x' };

describe('buildRequest', () => {
  it('is a claude-haiku-4-5 tool-use call carrying the prompt, returning verdict+reason', () => {
    const req = buildRequest([{ c: '0', company: 'Acme', text: 'PM role, B2B SaaS' }], RULES);
    expect(req.model).toBe('claude-haiku-4-5');
    expect(JSON.stringify(req)).toContain('B2B SaaS product');           // prompt included
    const schema = (req.tools[0].input_schema.properties.results.items as any).properties;
    expect(schema.verdict.enum).toEqual(['aligned', 'flagged', 'mixed', 'neutral']);
    expect(schema.reason.type).toBe('string');
    expect(req.messages[0].content).toContain('[id=0]');            // id token
  });
  it('budgets tokens for the reason text and scales with company count', () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ c: String(i), company: 'C' + i, text: 't' }));
    expect(buildRequest(mk(1), RULES).max_tokens).toBeGreaterThanOrEqual(256);
    expect(buildRequest(mk(10), RULES).max_tokens).toBeGreaterThanOrEqual(256 + 10 * 64);
    expect(buildRequest(mk(300), RULES).max_tokens).toBeLessThanOrEqual(4096);
  });
});

describe('extractVerdicts', () => {
  it('emits well-formed {c, verdict, reason} and drops the rest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const payload = { results: [
      { c: '0', verdict: 'aligned', reason: 'B2B SaaS product' },
      { c: '1', verdict: 'nope', reason: 'x' },           // bad verdict → drop
      { c: 2, verdict: 'flagged', reason: 'x' },          // c not string → drop
      { c: '3', verdict: 'mixed', reason: 42 },           // reason not string → drop
      { c: '4', verdict: 'flagged', reason: 'layoffs' },
    ] };
    const got: any[] = [];
    extractVerdicts(payload, (v) => got.push(v));
    expect(got.map((v) => v.c)).toEqual(['0', '4']);
    warn.mockRestore();
  });
  it('tolerates a missing/non-array results field', () => {
    const got: any[] = [];
    extractVerdicts({} as any, (v) => got.push(v));
    extractVerdicts({ results: 'x' } as any, (v) => got.push(v));
    expect(got).toEqual([]);
  });
});

describe('accumulateToolJson', () => {
  it('concatenates input_json_delta fragments into parseable JSON, ignores non-delta events and [DONE]', () => {
    // Realistic SSE stream: content_block_start, several deltas splitting the JSON, then DONE.
    // Full JSON: {"results":[{"c":"x","blue":[],"red":[]}]}
    const lines = [
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_01","name":"report","input":{}}}',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"results\\":[{\\"c\\":\\"x\\""}}',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":',
      // non-data line that should be ignored
      'event: ping',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":","blue":[],"red":[]}}]}"}}',
      'data: {"type":"content_block_stop","index":0}',
      'data: [DONE]',
    ];

    // Build the expected JSON from the two valid delta fragments
    const fragment1 = '{"results":[{"c":"x"';
    const fragment2 = ',"blue":[],"red":[]}]}';

    // Manually derive expected (not a tautology — we assert a specific string is produced)
    const expectedJson = fragment1 + fragment2;
    const expectedParsed = { results: [{ c: 'x', blue: [], red: [] }] };

    // Construct lines using the actual fragment values so the test is self-consistent
    const realLines = [
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_01","name":"report","input":{}}}',
      `data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":${JSON.stringify(fragment1)}}}`,
      'event: ping',
      `data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":${JSON.stringify(fragment2)}}}`,
      'data: {"type":"content_block_stop","index":0}',
      'data: [DONE]',
    ];

    const result = accumulateToolJson(realLines);

    // The accumulated string must equal the exact concatenation of the two fragments
    expect(result).toBe(expectedJson);
    // And must parse to the expected structure
    expect(JSON.parse(result)).toEqual(expectedParsed);
  });
});
