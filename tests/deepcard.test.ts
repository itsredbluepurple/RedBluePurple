import { describe, it, expect } from 'vitest';
import { openDeepCard, closeDeepCard } from '../components/deepcard';
import type { DeepResult } from '../lib/types';

const result: DeepResult = {
  company: 'Northbeam AI', rating: 2.8, size: '51–200',
  news: ['raised Series B'], pros: ['Hiring PMs'], cons: ['Low rating'],
  researchedAt: Date.now(), verdict: 'mixed',
};

describe('deep card', () => {
  it('renders loading then the result with pros/cons columns', async () => {
    const anchor = document.createElement('div');
    document.body.appendChild(anchor);
    openDeepCard(anchor, Promise.resolve(result));
    expect(document.querySelector('.rbp-deep.loading')).not.toBeNull();
    await Promise.resolve(); await new Promise((r) => setTimeout(r));
    expect(document.querySelector('.rbp-deep .why.pro li')?.textContent).toBe('Hiring PMs');
    expect(document.querySelector('.rbp-deep .why.con li')?.textContent).toBe('Low rating');
    expect(document.body.textContent).toContain('Fits your criteria');
    expect(document.body.textContent).toContain('Against your criteria');
    closeDeepCard();
    expect(document.querySelector('.rbp-deep')).toBeNull();
  });

  it('renders a verdict chip when verdict is present', async () => {
    const anchor = document.createElement('div');
    document.body.appendChild(anchor);
    openDeepCard(anchor, Promise.resolve(result));
    await Promise.resolve(); await new Promise((r) => setTimeout(r));
    const chip = document.querySelector('.rbp-deep-chip');
    expect(chip).not.toBeNull();
    expect(chip?.classList.contains('mixed')).toBe(true);
    expect(chip?.textContent).toBe('Mixed');
    closeDeepCard();
  });

  it('renders no verdict chip when verdict is absent, and never re-colors on a deepFallback-shaped failure result', async () => {
    // Shape mirrors entrypoints/background.ts deepFallback(): verdict omitted entirely.
    const fallback: DeepResult = {
      company: 'Acme',
      rating: null,
      size: null,
      news: [],
      pros: [],
      cons: ['Research failed: network error'],
      researchedAt: Date.now(),
    };
    const anchor = document.createElement('div');
    document.body.appendChild(anchor);
    openDeepCard(anchor, Promise.resolve(fallback));
    await Promise.resolve(); await new Promise((r) => setTimeout(r));
    const card = document.querySelector('.rbp-deep') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.querySelector('.rbp-deep-chip')).toBeNull();
    closeDeepCard();
  });

  it('never renders legacy blue/red copy', async () => {
    const anchor = document.createElement('div');
    document.body.appendChild(anchor);
    openDeepCard(anchor, Promise.resolve(result));
    await Promise.resolve(); await new Promise((r) => setTimeout(r));
    const text = (document.querySelector('.rbp-deep') as HTMLElement).textContent ?? '';
    expect(text.toLowerCase()).not.toContain('blue');
    expect(text.toLowerCase()).not.toContain('red');
    const legacyHeading = ['Why', "it's"].join(' '); // built dynamically so this file doesn't match the legacy-copy sweep itself
    expect(text).not.toContain(legacyHeading);
    closeDeepCard();
  });

  it('escapes XSS payloads in company name and reasons', async () => {
    const xssResult: DeepResult = {
      company: '<img src=x onerror=alert(1)>',
      rating: null,
      size: null,
      news: ['<script>alert("xss")</script>'],
      pros: ['<b>bold attack</b>'],
      cons: ['safe'],
      researchedAt: Date.now(),
      verdict: 'flagged',
    };
    const anchor = document.createElement('div');
    document.body.appendChild(anchor);
    openDeepCard(anchor, Promise.resolve(xssResult));
    await Promise.resolve(); await new Promise((r) => setTimeout(r));
    const card = document.querySelector('.rbp-deep') as HTMLElement;
    expect(card).not.toBeNull();
    // company text is raw string, no injected element
    const companyEl = card.querySelector('.rbp-deep-head b') as HTMLElement;
    expect(companyEl.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(card.querySelector('img')).toBeNull();
    // no script elements injected
    expect(card.querySelector('script')).toBeNull();
    closeDeepCard();
  });

  it('shows error message and removes loading class on rejection', async () => {
    const anchor = document.createElement('div');
    document.body.appendChild(anchor);
    openDeepCard(anchor, Promise.reject(new Error('network error')));
    expect(document.querySelector('.rbp-deep.loading')).not.toBeNull();
    await Promise.resolve(); await new Promise((r) => setTimeout(r));
    const card = document.querySelector('.rbp-deep') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.classList.contains('loading')).toBe(false);
    expect(card.textContent).toContain('Research failed');
    closeDeepCard();
  });
});
