import type { Scanner, ScanInput, Rules, CompanyVerdict, Verdict } from '../types';
import { isVerdict } from '../verdict';
import { anthropicRequest } from '../anthropic';
import { log } from '../log';

const MODEL = 'claude-haiku-4-5';

export function buildRequest(batch: ScanInput[], rules: Rules) {
  const companies = batch
    .map((b) => `[id=${b.c}] ${b.company}\n${b.text.slice(0, 1200)}`)
    .join('\n\n');
  return {
    model: MODEL,
    // reasons add output tokens; budget generously, capped.
    max_tokens: Math.min(4096, 256 + batch.length * 64),
    stream: true,
    tool_choice: { type: 'tool', name: 'report' },
    tools: [
      {
        name: 'report',
        description: 'Report a verdict and one-line reason for each company.',
        input_schema: {
          type: 'object',
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  c: {
                    type: 'string',
                    description: 'The exact id token shown as [id=N] for this company (e.g. "0"). Never the company name.',
                  },
                  verdict: { type: 'string', enum: ['aligned', 'flagged', 'mixed', 'neutral'] },
                  reason: { type: 'string', description: 'One short sentence explaining the verdict.' },
                },
                required: ['c', 'verdict', 'reason'],
              },
            },
          },
          required: ['results'],
        },
      },
    ],
    system:
      "You triage companies for a job seeker against their own criteria. For each company decide:\n" +
      "- aligned: clearly matches what they want and trips none of their stated dealbreakers.\n" +
      "- mixed: genuinely matches what they want BUT also trips a stated dealbreaker.\n" +
      "- flagged: trips one of their stated dealbreakers (and is not otherwise a match).\n" +
      "- neutral: their criteria simply don't apply to this listing — nothing notable for or against. Merely not matching is neutral, not flagged.\n" +
      "Judge only from each company's listing text. Set \"c\" to the company's exact [id=N] token (e.g. \"0\"), never its name. " +
      "Give one short reason. No prose outside the tool call.\n\n" +
      `Their criteria:\n${rules.prompt}`,
    messages: [{ role: 'user', content: `Classify these companies:\n\n${companies}` }],
  };
}

interface RawResult { c: string; verdict: Verdict; reason: string }
function isWellFormed(r: unknown): r is RawResult {
  const v = r as RawResult;
  return !!v && typeof v.c === 'string' && isVerdict(v.verdict) && typeof v.reason === 'string';
}

export function extractVerdicts(
  toolInput: { results?: unknown },
  emit: (v: CompanyVerdict) => void,
): void {
  const results = Array.isArray(toolInput?.results) ? toolInput.results : [];
  let dropped = 0;
  for (const r of results) {
    if (isWellFormed(r)) emit({ c: r.c, verdict: r.verdict, reason: r.reason });
    else dropped++;
  }
  if (dropped) log.warn('scan:dropped_malformed_verdicts', { dropped });
}

// Accumulate streamed SSE `input_json_delta` text into a single JSON string.
export function accumulateToolJson(events: string[]): string {
  let json = '';
  for (const line of events) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data === '[DONE]') continue;
    try {
      const evt = JSON.parse(data);
      if (evt.type === 'content_block_delta' && evt.delta?.type === 'input_json_delta') {
        json += evt.delta.partial_json;
      }
    } catch { /* partial line, ignore */ }
  }
  return json;
}

// The wrapper's timeout only covers time-to-headers; once streaming starts a
// stalled body would hang forever. Bound each read so a stuck stream fails loud.
const STREAM_IDLE_MS = 30000;

async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  ms: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Scan stream stalled (no data for ${ms}ms)`)), ms);
  });
  try {
    return await Promise.race([reader.read(), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export const haikuScanner: Scanner = {
  async scan(batch: ScanInput[], rules: Rules, onResult: (v: CompanyVerdict) => void) {
    log.info('scan:chunk:start', { companies: batch.length, model: MODEL });
    const res = await anthropicRequest(buildRequest(batch, rules), rules.apiKey, {
      label: 'scan',
      timeoutMs: 30000,
    });
    if (!res.body) throw new Error('Anthropic scan response had no body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const lines: string[] = [];
    try {
      for (;;) {
        const { value, done } = await readWithTimeout(reader, STREAM_IDLE_MS);
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          lines.push(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
        }
      }
    } catch (e) {
      // Release the stalled stream, then fail loud so the chunk degrades.
      reader.cancel().catch((err) => log.warn('scan:reader_cancel_failed', { reason: String(err) }));
      log.error('scan:chunk:stream_failed', { reason: (e as Error).message });
      throw e;
    }
    // Flush any held multi-byte sequence from the TextDecoder.
    buffer += decoder.decode();
    // A final SSE line may arrive without a trailing newline; don't drop it.
    if (buffer.length > 0) lines.push(buffer);
    // Tool-use JSON streams as one growing object; parse once complete, then emit.
    const json = accumulateToolJson(lines);
    let emitted = 0;
    try {
      extractVerdicts(JSON.parse(json), (v) => {
        emitted++;
        onResult(v);
      });
    } catch (e) {
      log.error('scan:chunk:parse_failed', { bytes: json.length });
      throw new Error(`Could not parse scan output: ${(e as Error).message}`);
    }
    log.info('scan:chunk:done', { emitted });
  },
};
