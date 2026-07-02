import { describe, it, expect } from 'vitest';
import { SessionCache } from '../lib/cache';

describe('SessionCache', () => {
  it('normalizes case, whitespace, and legal suffixes', () => {
    const c = new SessionCache('');
    expect(c.normalize('  Acme   Corp  ')).toBe('acme corp');
    expect(c.normalize('Acme, Inc.')).toBe('acme');
    expect(c.normalize('Acme LLC')).toBe('acme');
  });
  it('treats normalized-equal names as the same entry', () => {
    const c = new SessionCache('');
    c.set('Acme Inc', { c: '1', verdict: 'aligned', reason: 'test match' });
    expect(c.has('  acme  ')).toBe(true);
    expect(c.get('ACME, INC.')?.verdict).toBe('aligned');
  });
  it('misses unknown names', () => {
    const c = new SessionCache('');
    expect(c.has('Nope')).toBe(false);
  });
});
