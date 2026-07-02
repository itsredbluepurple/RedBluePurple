import { describe, it, expect } from 'vitest';
import { buildDeepRequest, parseDeepResponse } from '../lib/deep/sonnet';
const RULES = { prompt: 'Want growing B2B SaaS; avoid low Glassdoor ratings.', apiKey: 'sk-ant-x' };

describe('buildDeepRequest', () => {
  it('is a web-search claude-sonnet-4-6 call carrying the prompt and a verdict-returning brief tool', () => {
    const req = buildDeepRequest('Datadog', RULES);
    expect(req.model).toBe('claude-sonnet-4-6');
    expect(JSON.stringify(req.tools)).toContain('web_search_20250305');
    expect(JSON.stringify(req.tools)).toContain('"name":"brief"');
    expect(JSON.stringify(req)).toContain('Datadog');
    expect(JSON.stringify(req)).toContain('avoid low Glassdoor');
    const brief = (req.tools as any[]).find((t) => t.name === 'brief');
    expect(brief.input_schema.properties.verdict.enum).toEqual(['aligned', 'flagged', 'mixed', 'neutral']);
    expect(brief.input_schema.properties.pros.type).toBe('array');
    expect(brief.input_schema.properties.cons.type).toBe('array');
    expect(brief.input_schema.required).toEqual(['verdict', 'news', 'pros', 'cons']);
  });
});

describe('parseDeepResponse', () => {
  it('maps a structured payload including the verdict, pros, and cons', () => {
    const r = parseDeepResponse({ verdict: 'mixed', rating: 2.8, size: '10-50', news: ['x'], pros: ['sales role'], cons: ['2.8 stars'] }, 'ADH');
    expect(r.company).toBe('ADH');
    expect(r.verdict).toBe('mixed');
    expect(r.rating).toBe(2.8);
    expect(r.pros).toEqual(['sales role']);
    expect(r.cons).toEqual(['2.8 stars']);
    expect(r.researchedAt).toBeGreaterThan(0);
  });

  it('passes a valid neutral verdict through', () => {
    const r = parseDeepResponse({ verdict: 'neutral', news: [], pros: [], cons: [] }, 'Acme');
    expect(r.verdict).toBe('neutral');
  });

  it('leaves verdict undefined when missing or invalid, and coerces missing fields', () => {
    const missing = parseDeepResponse({}, 'Acme');
    expect(missing.verdict).toBeUndefined();
    expect(missing.rating).toBeNull();
    expect(missing.news).toEqual([]);
    expect(missing.pros).toEqual([]);
    expect(missing.cons).toEqual([]);

    const invalid = parseDeepResponse({ verdict: 'bogus' }, 'Acme');
    expect(invalid.verdict).toBeUndefined();
  });
});
