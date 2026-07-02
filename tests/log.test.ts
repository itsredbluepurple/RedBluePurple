import { describe, it, expect, vi, afterEach } from 'vitest';
import { log } from '../lib/log';

afterEach(() => vi.restoreAllMocks());

describe('log', () => {
  it('prefixes and serializes event + data', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    log.info('scan:start', { companies: 5 });
    expect(spy).toHaveBeenCalledWith('[RBP] scan:start {"companies":5}');
  });

  it('redacts secret-looking fields so keys never reach the console', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    log.warn('boom', { apiKey: 'sk-ant-secret', authorization: 'Bearer x', companies: 2 });
    const out = spy.mock.calls[0][0] as string;
    expect(out).not.toContain('sk-ant-secret');
    expect(out).not.toContain('Bearer x');
    expect(out).toContain('[redacted]');
    expect(out).toContain('"companies":2');
  });

  it('redacts secrets nested inside a logged object', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    log.info('rules:loaded', { rules: { blue: ['x'], apiKey: 'sk-ant-nested' } });
    const out = spy.mock.calls[0][0] as string;
    expect(out).not.toContain('sk-ant-nested');
    expect(out).toContain('[redacted]');
    expect(out).toContain('"blue":["x"]');
  });

  it('routes error() to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    log.error('scan:failed', { status: 500 });
    expect(spy).toHaveBeenCalledWith('[RBP] scan:failed {"status":500}');
  });
});
