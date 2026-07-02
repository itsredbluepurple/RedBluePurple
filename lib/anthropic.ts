// Production-grade wrapper for the Anthropic Messages API: every call goes through
// here so retry, rate-limit handling, timeouts, and loud failures are uniform.
// The BYO key is read per-call from the caller (never stored here, never logged).
import { log } from './log';

const API = 'https://api.anthropic.com/v1/messages';

// 429 (rate limit), 529 (overloaded), and transient 5xx/timeout statuses are worth
// retrying; 4xx client/auth errors are not — they will fail identically on retry.
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

export type AnthropicErrorKind = 'auth' | 'rate_limit' | 'server' | 'client' | 'network' | 'timeout';

export class AnthropicError extends Error {
  constructor(message: string, readonly kind: AnthropicErrorKind, readonly status?: number) {
    super(message);
    this.name = 'AnthropicError';
  }
}

export interface AnthropicCallOptions {
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  label?: string; // identifies the call in logs, e.g. 'scan' | 'deep'
}

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

// Exponential backoff with equal jitter (range [ceiling/2, ceiling]), capped —
// spreads retries so a fleet of content scripts doesn't synchronize and hammer
// the API in lockstep, while still guaranteeing a minimum wait.
export function backoffDelayMs(attempt: number, baseMs: number, maxMs: number): number {
  const ceiling = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.round(ceiling / 2 + Math.random() * (ceiling / 2));
}

// Honor a server-provided Retry-After (delta-seconds or HTTP-date); null if absent/unparseable.
export function retryAfterMs(res: Response): number | null {
  const header = res.headers.get('retry-after');
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return Math.max(0, seconds * 1000);
  const when = Date.parse(header);
  return Number.isNaN(when) ? null : Math.max(0, when - Date.now());
}

function statusKind(status: number): AnthropicErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  return status >= 500 ? 'server' : 'client';
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function authHeaders(apiKey: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

// Returns the raw Response (200) so streaming callers can read the body themselves.
// Throws AnthropicError on any terminal failure — never resolves on a non-2xx.
export async function anthropicRequest(
  body: unknown,
  apiKey: string,
  opts: AnthropicCallOptions = {},
): Promise<Response> {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new AnthropicError('No Anthropic API key set — add one in Settings.', 'auth');
  }
  const { timeoutMs = 30000, maxRetries = 4, baseDelayMs = 500, maxDelayMs = 8000, label = 'request' } = opts;

  let lastError: AnthropicError | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        if (attempt > 0) log.info(`anthropic:${label}:recovered`, { attempt });
        return res;
      }

      const { status } = res;
      if (isRetryableStatus(status) && attempt < maxRetries) {
        const waitMs = retryAfterMs(res) ?? backoffDelayMs(attempt, baseDelayMs, maxDelayMs);
        lastError = new AnthropicError(`Anthropic HTTP ${status}`, statusKind(status), status);
        log.warn(`anthropic:${label}:retry`, { status, attempt, waitMs });
        await sleep(waitMs);
        continue;
      }

      const detail = (await res.text().catch(() => '')).slice(0, 300);
      log.error(`anthropic:${label}:failed`, { status, kind: statusKind(status) });
      throw new AnthropicError(`Anthropic HTTP ${status}: ${detail}`, statusKind(status), status);
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof AnthropicError) throw err;
      const aborted = (err as { name?: string })?.name === 'AbortError';
      const kind: AnthropicErrorKind = aborted ? 'timeout' : 'network';
      const message = aborted ? `Request timed out after ${timeoutMs}ms` : `Network error: ${(err as Error).message}`;
      if (attempt < maxRetries) {
        const waitMs = backoffDelayMs(attempt, baseDelayMs, maxDelayMs);
        lastError = new AnthropicError(message, kind);
        log.warn(`anthropic:${label}:retry`, { kind, attempt, waitMs });
        await sleep(waitMs);
        continue;
      }
      log.error(`anthropic:${label}:failed`, { kind });
      throw new AnthropicError(message, kind);
    }
  }
  throw lastError ?? new AnthropicError('Exhausted retries', 'server');
}

// Convenience for non-streaming callers: request + parse, failing loud on bad JSON.
export async function anthropicJson<T = unknown>(
  body: unknown,
  apiKey: string,
  opts: AnthropicCallOptions = {},
): Promise<T> {
  const res = await anthropicRequest(body, apiKey, opts);
  try {
    return (await res.json()) as T;
  } catch {
    throw new AnthropicError('Anthropic returned a malformed JSON response', 'server', res.status);
  }
}
