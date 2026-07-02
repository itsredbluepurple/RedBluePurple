import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  anthropicRequest,
  anthropicJson,
  AnthropicError,
  isRetryableStatus,
  backoffDelayMs,
  retryAfterMs,
} from '../lib/anthropic';

// Fast, deterministic retry options for tests.
const FAST = { baseDelayMs: 1, maxDelayMs: 2, maxRetries: 3, timeoutMs: 1000 };

function makeRes(opts: { status?: number; body?: string; json?: unknown; headers?: Record<string, string> }) {
  const { status = 200, body = '', json, headers = {} } = opts;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => (json !== undefined ? json : JSON.parse(body)),
  } as unknown as Response;
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('pure helpers', () => {
  it('isRetryableStatus: 429/529/503 retry, 400/401/200 do not', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(529)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(200)).toBe(false);
  });

  it('retryAfterMs: delta-seconds, missing, and garbage', () => {
    expect(retryAfterMs(makeRes({ headers: { 'retry-after': '2' } }))).toBe(2000);
    expect(retryAfterMs(makeRes({}))).toBeNull();
    expect(retryAfterMs(makeRes({ headers: { 'retry-after': 'soon' } }))).toBeNull();
  });

  it('backoffDelayMs grows with attempts and stays within [ceiling/2, ceiling]', () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const ceiling = Math.min(8000, 500 * 2 ** attempt);
      const d = backoffDelayMs(attempt, 500, 8000);
      expect(d).toBeGreaterThanOrEqual(Math.floor(ceiling / 2));
      expect(d).toBeLessThanOrEqual(ceiling);
    }
  });
});

describe('anthropicRequest', () => {
  it('fails fast with no key and never calls fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(anthropicRequest({}, '', FAST)).rejects.toMatchObject({ kind: 'auth' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the response on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeRes({ status: 200, body: '{}' }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await anthropicRequest({}, 'sk-ant-x', FAST);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a 429 then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeRes({ status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(makeRes({ status: 200, body: '{}' }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await anthropicRequest({}, 'sk-ant-x', FAST);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a transient 503 then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeRes({ status: 503 }))
      .mockResolvedValueOnce(makeRes({ status: 200, body: '{}' }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await anthropicRequest({}, 'sk-ant-x', FAST);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a network error then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(makeRes({ status: 200, body: '{}' }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await anthropicRequest({}, 'sk-ant-x', FAST);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry a 400 and surfaces the API error detail', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeRes({ status: 400, body: '{"error":{"message":"bad tool"}}' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(anthropicRequest({}, 'sk-ant-x', FAST)).rejects.toMatchObject({ kind: 'client', status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(anthropicRequest({}, 'sk-ant-x', FAST)).rejects.toThrow(/bad tool/);
  });

  it('does NOT retry a 401 (bad key)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeRes({ status: 401, body: 'unauthorized' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(anthropicRequest({}, 'sk-ant-x', FAST)).rejects.toMatchObject({ kind: 'auth', status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxRetries on persistent 503', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeRes({ status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(anthropicRequest({}, 'sk-ant-x', { ...FAST, maxRetries: 2 })).rejects.toMatchObject({ kind: 'server' });
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('classifies an aborted request as a timeout', async () => {
    const fetchMock = vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(anthropicRequest({}, 'sk-ant-x', { ...FAST, maxRetries: 0 })).rejects.toMatchObject({ kind: 'timeout' });
  });
});

describe('anthropicJson', () => {
  it('parses a valid JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeRes({ status: 200, json: { ok: true } })));
    await expect(anthropicJson({}, 'sk-ant-x', FAST)).resolves.toEqual({ ok: true });
  });

  it('fails loud on malformed JSON', async () => {
    const res = makeRes({ status: 200 });
    (res as unknown as { json: () => Promise<unknown> }).json = async () => {
      throw new Error('Unexpected end of JSON input');
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));
    await expect(anthropicJson({}, 'sk-ant-x', FAST)).rejects.toMatchObject({ kind: 'server' });
  });
});
