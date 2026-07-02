// Structured, prefixed logging so a teammate reading the service-worker console
// can reconstruct what the scanner did — not just what failed. Secrets must never
// reach the console, so values are redacted defensively even if a caller slips.

const PREFIX = '[RBP]';
const SECRET_KEYS = /^(apikey|x-api-key|authorization|key|token|secret)$/i;

// Recurse so a secret nested inside a logged object (e.g. logging `{ rules }`,
// which carries apiKey) is redacted too, not just top-level keys.
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEYS.test(k) ? '[redacted]' : redact(v);
    }
    return out;
  }
  return value;
}

function line(event: string, data?: Record<string, unknown>): string {
  return `${PREFIX} ${event}${data ? ' ' + JSON.stringify(redact(data)) : ''}`;
}

export const log = {
  info: (event: string, data?: Record<string, unknown>) => console.info(line(event, data)),
  warn: (event: string, data?: Record<string, unknown>) => console.warn(line(event, data)),
  error: (event: string, data?: Record<string, unknown>) => console.error(line(event, data)),
};
