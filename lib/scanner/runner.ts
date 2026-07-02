// Orchestrates a Scanner over a validated batch, split into chunks, so one
// chunk's terminal failure (after the wrapper's retries) skips only those
// companies and the rest of the page still gets tagged. One job: failure
// isolation + boundary validation for the Tier-1 scan.
import type { Scanner, ScanInput, Rules, CompanyVerdict } from '../types';
import { log } from '../log';

// The scan call reads rules.prompt and rules.apiKey; reject a payload missing
// that shape rather than letting buildRequest throw mid-flight.
export function validateRules(rules: unknown): rules is Rules {
  const r = rules as Rules;
  return !!r && typeof r.prompt === 'string' && typeof r.apiKey === 'string';
}

// Keep per-call output small enough that the token budget never truncates and a
// single failure blasts only a handful of listings, not the whole page.
export const CHUNK_SIZE = 8;

export interface ScanEmit {
  verdict(v: CompanyVerdict): void;
  chunkError(ids: string[], reason: string): void;
}

export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return items.length ? [items] : [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Treat the Port payload as hostile: a content script (or a malformed message)
// could send anything. Only proceed on a well-formed, non-empty batch.
export function validateScanBatch(batch: unknown): batch is ScanInput[] {
  return (
    Array.isArray(batch) &&
    batch.length > 0 &&
    batch.every(
      (b) =>
        !!b &&
        typeof (b as ScanInput).c === 'string' &&
        typeof (b as ScanInput).company === 'string' &&
        typeof (b as ScanInput).text === 'string',
    )
  );
}

export async function runScan(
  scanner: Scanner,
  batch: ScanInput[],
  rules: Rules,
  emit: ScanEmit,
  chunkSize: number = CHUNK_SIZE,
): Promise<void> {
  const chunks = chunk(batch, chunkSize);
  log.info('scan:start', { companies: batch.length, chunks: chunks.length });
  let chunksOk = 0;
  let chunksFailed = 0;
  for (const group of chunks) {
    try {
      await scanner.scan(group, rules, emit.verdict);
      chunksOk++;
    } catch (err) {
      chunksFailed++;
      const reason = err instanceof Error ? err.message : String(err);
      log.error('scan:chunk:dropped', { companies: group.length, reason });
      emit.chunkError(
        group.map((g) => g.c),
        reason,
      );
    }
  }
  log.info('scan:done', { chunksOk, chunksFailed });
}
