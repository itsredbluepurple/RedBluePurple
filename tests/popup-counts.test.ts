import { describe, it, expect } from 'vitest';
import { renderCounts } from '../entrypoints/popup/main';

describe('popup renderCounts', () => {
  it('shows each verdict tally', () => {
    const html = renderCounts({ aligned: 4, mixed: 2, flagged: 3, neutral: 5, scanning: 1 });
    expect(html).toContain('4');
    expect(html).toContain('Aligned');
    expect(html).toContain('Flagged');
    expect(html).toContain('Neutral');
    expect(html).toContain('3');
    expect(html).toContain('5');
  });
  it('handles an unscanned tab gracefully', () => {
    const html = renderCounts({ aligned: 0, mixed: 0, flagged: 0, neutral: 0, scanning: 0 });
    expect(html).toContain('0');
    expect(html).toContain('Aligned');
    expect(html).toContain('Mixed');
    expect(html).toContain('Flagged');
    expect(html).toContain('Neutral');
  });
});
