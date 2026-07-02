import { describe, it, expect } from 'vitest';
import { SCAN_PORT, DEEP_MSG } from '../lib/messaging';

describe('messaging constants', () => {
  it('are stable strings', () => {
    expect(SCAN_PORT).toBe('rbp-scan');
    expect(DEEP_MSG).toBe('rbp-deep');
  });
});
