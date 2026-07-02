import type { ScanInput, CompanyVerdict, Rules } from './types';

export const SCAN_PORT = 'rbp-scan';

export interface ScanRequest { batch: ScanInput[]; rules: Rules }
export type ScanStreamMsg =
  | { type: 'verdict'; v: CompanyVerdict }
  | { type: 'chunkError'; ids: string[]; reason: string } // a chunk failed; these ids stay untagged
  | { type: 'done' }
  | { type: 'error'; message: string };

export const DEEP_MSG = 'rbp-deep';
export interface DeepRequest { kind: typeof DEEP_MSG; company: string }
