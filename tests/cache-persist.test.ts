import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { SessionCache, fnv1a } from '../lib/cache';

const PROMPT_A = 'Growing headcount, avoid recent layoffs.';
const PROMPT_B = 'Remote-friendly, avoid on-site mandates.';

describe('SessionCache persistence', () => {
  beforeEach(() => fakeBrowser.reset());

  it('hydrates from empty storage without throwing, cache stays empty', async () => {
    const c = new SessionCache(fnv1a(PROMPT_A));
    await expect(c.hydrate()).resolves.toBeUndefined();
    expect(c.has('Acme')).toBe(false);
  });

  it('round-trips a verdict across pages under the same prompt', async () => {
    const c1 = new SessionCache(fnv1a(PROMPT_A));
    c1.set('Acme', { c: 'page-local-1', verdict: 'aligned', reason: 'growing fast' });
    await c1.persist();

    const c2 = new SessionCache(fnv1a(PROMPT_A));
    await c2.hydrate();
    const hit = c2.get('Acme');
    expect(hit?.verdict).toBe('aligned');
    expect(hit?.reason).toBe('growing fast');
  });

  it('discards stored entries when the prompt hash changes', async () => {
    const c1 = new SessionCache(fnv1a(PROMPT_A));
    c1.set('Acme', { c: 'x', verdict: 'aligned', reason: 'growing fast' });
    await c1.persist();

    const c2 = new SessionCache(fnv1a(PROMPT_B));
    await c2.hydrate();
    expect(c2.has('Acme')).toBe(false);
  });

  it('drops entries older than 24h on hydrate', async () => {
    const promptHash = fnv1a(PROMPT_A);
    const now = Date.now();
    await fakeBrowser.storage.local.set({
      'rbp:verdictCache:v1': {
        promptHash,
        savedAt: now,
        entries: {
          stale: { verdict: 'aligned', reason: 'old news', at: now - 25 * 60 * 60 * 1000 },
          fresh: { verdict: 'flagged', reason: 'recent', at: now - 1000 },
        },
      },
    });
    const c = new SessionCache(promptHash);
    await c.hydrate();
    expect(c.has('stale')).toBe(false);
    expect(c.get('fresh')?.verdict).toBe('flagged');
  });

  it('drops malformed entries but keeps valid siblings', async () => {
    const promptHash = fnv1a(PROMPT_A);
    const now = Date.now();
    await fakeBrowser.storage.local.set({
      'rbp:verdictCache:v1': {
        promptHash,
        savedAt: now,
        entries: {
          badVerdict: { verdict: 'blue', reason: 'nope', at: now },
          badReason: { verdict: 'aligned', reason: 42, at: now },
          missingAt: { verdict: 'aligned', reason: 'no timestamp' },
          nanAt: { verdict: 'aligned', reason: 'poisoned timestamp', at: NaN },
          good: { verdict: 'mixed', reason: 'ok', at: now },
        },
      },
    });
    const c = new SessionCache(promptHash);
    await c.hydrate();
    expect(c.has('badVerdict')).toBe(false);
    expect(c.has('badReason')).toBe(false);
    expect(c.has('missingAt')).toBe(false);
    expect(c.has('nanAt')).toBe(false);
    expect(c.get('good')?.verdict).toBe('mixed');
  });

  it('caps persisted entries at 500, evicting the oldest first', async () => {
    const promptHash = fnv1a(PROMPT_A);
    const c = new SessionCache(promptHash);
    const now = Date.now();
    for (let i = 0; i < 501; i++) {
      c.set(`company-${i}`, { c: String(i), verdict: 'neutral', reason: `r${i}` });
    }
    // Force distinct `at` timestamps (oldest = company-0) since set() runs synchronously.
    const internal = (c as unknown as { map: Map<string, { entry: unknown; at: number }> }).map;
    let i = 0;
    for (const [, v] of internal) { v.at = now + i; i++; }

    await c.persist();

    const c2 = new SessionCache(promptHash);
    await c2.hydrate();
    expect(c2.has('company-0')).toBe(false); // oldest evicted
    expect(c2.has('company-500')).toBe(true); // newest kept
    const c2internal = (c2 as unknown as { map: Map<string, unknown> }).map;
    expect(c2internal.size).toBe(500);
  });
});
