import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { indeedAdapter, glassdoorAdapter, pickAdapter } from '../lib/placement/adapter';

function load(name: string) {
  document.body.innerHTML = readFileSync(resolve(__dirname, 'fixtures', name), 'utf8');
}

describe('placement adapters', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('pickAdapter routes by hostname', () => {
    expect(pickAdapter('https://www.indeed.com/jobs?q=product+manager')?.id).toBe('indeed');
    expect(pickAdapter('https://www.glassdoor.com/Job/index.htm')?.id).toBe('glassdoor');
    expect(pickAdapter('https://example.com')).toBeNull();
  });

  it('indeed: finds each company name and its listing text', () => {
    load('indeed-results.html');
    const rows = indeedAdapter.collect(document);
    expect(rows.map((r) => r.company)).toEqual(['Arcwave Security', 'Dunmoor Logistics']);
    expect(rows[0].anchor.textContent).toBe('Arcwave Security');
    expect(rows[0].text).toContain('Product Manager');
    expect(rows[0].text).toContain('B2B security platform');
  });

  it('glassdoor: finds each company name and its listing text', () => {
    load('glassdoor-results.html');
    const rows = glassdoorAdapter.collect(document);
    expect(rows.map((r) => r.company)).toEqual(['Northbeam AI', 'Helios Data']);
    expect(rows[0].anchor.textContent).toBe('Northbeam AI');
    expect(rows[0].text).toContain('Product Manager');
    expect(rows[0].text).toContain('AI analytics');
    expect(rows[1].text).toContain('Product Manager');
  });

  it('collect is idempotent-safe: returns same count on re-run', () => {
    load('indeed-results.html');
    expect(indeedAdapter.collect(document).length).toBe(2);
    expect(indeedAdapter.collect(document).length).toBe(2);
  });
});
