import { describe, it, expect } from 'vitest';
import { createBadge, setVerdict, selectBadge, deselectAll } from '../components/badge';

describe('badge', () => {
  it('starts in scanning state', () => {
    const b = createBadge();
    expect(b.classList.contains('rbp-badge')).toBe(true);
    expect(b.classList.contains('scanning')).toBe(true);
    expect(b.querySelector('.lbl')?.textContent).toBe('Scanning');
  });
  it('swaps to a verdict with the right label and pop', () => {
    const b = createBadge();
    setVerdict(b, 'mixed');
    expect(b.classList.contains('scanning')).toBe(false);
    expect(b.classList.contains('mixed')).toBe(true);
    expect(b.classList.contains('pop')).toBe(true);
    expect(b.querySelector('.lbl')?.textContent).toBe('Mixed');
  });
  it('selection toggles the sel class exclusively', () => {
    const root = document.createElement('div');
    const a = createBadge(); const c = createBadge();
    root.append(a, c);
    selectBadge(a);
    expect(a.classList.contains('sel')).toBe(true);
    deselectAll(root);
    expect(a.classList.contains('sel')).toBe(false);
  });
});
