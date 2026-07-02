import { storage } from '#imports';
import type { CompanyVerdict } from './types';
import { isVerdict } from './verdict';
import { log } from './log';

const KEY = 'local:rbp:verdictCache:v1';
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;

export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

interface StoredEntry { verdict: string; reason: string; at: number }
interface StoredCache { promptHash: string; savedAt: number; entries: Record<string, StoredEntry> }

const SUFFIX = /[\s,]+(inc|llc|ltd|co|plc|gmbh)\.?$/i;

export class SessionCache {
  private map = new Map<string, { entry: CompanyVerdict; at: number }>();

  constructor(private promptHash: string) {}

  normalize(name: string): string {
    let s = name.trim().toLowerCase().replace(/\s+/g, ' ');
    s = s.replace(SUFFIX, '').replace(/[.,]+$/, '').trim();
    return s;
  }
  has(name: string): boolean {
    return this.map.has(this.normalize(name));
  }
  get(name: string): CompanyVerdict | undefined {
    return this.map.get(this.normalize(name))?.entry;
  }
  set(name: string, v: CompanyVerdict): void {
    this.map.set(this.normalize(name), { entry: v, at: Date.now() });
  }

  async hydrate(): Promise<void> {
    const raw = await storage.getItem<StoredCache>(KEY);
    if (!raw || raw.promptHash !== this.promptHash) return; // new criteria = new judgements
    const now = Date.now();
    let dropped = 0;
    for (const [name, e] of Object.entries(raw.entries ?? {})) {
      // Boundary: stored data is treated as hostile — validate every field.
      if (!e || !isVerdict(e.verdict) || typeof e.reason !== 'string' || !Number.isFinite(e.at) || now - e.at > TTL_MS) { dropped++; continue; }
      this.map.set(name, { entry: { c: '', verdict: e.verdict, reason: e.reason }, at: e.at });
    }
    if (dropped) log.info('cache:hydrate_dropped', { dropped });
    log.info('cache:hydrated', { entries: this.map.size });
  }

  async persist(): Promise<void> {
    const list = [...this.map.entries()].sort((a, b) => b[1].at - a[1].at).slice(0, MAX_ENTRIES);
    const entries: Record<string, StoredEntry> = {};
    for (const [name, v] of list) entries[name] = { verdict: v.entry.verdict, reason: v.entry.reason, at: v.at };
    await storage.setItem(KEY, { promptHash: this.promptHash, savedAt: Date.now(), entries });
  }
}
