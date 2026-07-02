import { storage } from '#imports';
import type { Rules } from './types';

// Local type for the legacy v1 rule shape (before the contract task removed these fields).
// Used ONLY in promptFromLegacy and the v1→v2 storage migration — the real Rules type no
// longer has these fields. The migration legitimately reads old stored data, so it needs them.
interface LegacyRules {
  blue?: string[];
  red?: string[];
  ratingFloor?: number;
  sizeFloor?: number;
  sizeCeiling?: number;
  apiKey?: string;
  prompt?: string;
}

// Generic placeholder rules (the same defaults shown in settings.html).
// NOT anyone's real preferences — the product is generic.
export const DEFAULT_RULES: Rules = {
  prompt: '',
  apiKey: '',
};

/**
 * Convert legacy blue/red tag arrays into a starter prompt string.
 * Returns '' when no tags are present (including when only apiKey is present).
 */
export function promptFromLegacy(old: LegacyRules): string {
  const blue = (old.blue ?? []).filter(Boolean);
  const red = (old.red ?? []).filter(Boolean);
  if (!blue.length && !red.length) return '';
  const parts: string[] = [];
  if (blue.length) parts.push(`Worth my time: ${blue.join(', ')}.`);
  if (red.length) parts.push(`Avoid: ${red.join(', ')}.`);
  return parts.join(' ');
}

// Versioned storage item — v2 introduces the free-text prompt.
// WXT runs the migration automatically on extension update for real users.
// defaultValue stays as {} so getValue() returns {} (not the legacy defaults)
// when nothing is stored, keeping the getRules() fallback check unambiguous.
export const rulesItem = storage.defineItem<Partial<Rules>>('local:rbp:rules', {
  defaultValue: {},
  version: 2,
  migrations: {
    // v1 (tag/slider rules) → v2 (prompt): preserve intent, carry the key.
    // Cast old to LegacyRules so we can read the pre-contract fields; they live
    // in real storage from v1 users even though Rules no longer declares them.
    2: (old): Partial<Rules> => {
      const legacy = old as LegacyRules | undefined;
      const prompt = (legacy?.prompt && legacy.prompt.trim()) || promptFromLegacy(legacy ?? {});
      const apiKey = legacy?.apiKey ?? '';
      return { ...DEFAULT_RULES, prompt, apiKey };
    },
  },
});

export async function getRules(): Promise<Rules> {
  const saved = (await rulesItem.getValue()) ?? {};
  const merged: Rules = { ...DEFAULT_RULES, ...saved };
  // Fallback migration: WXT's defineItem migration fires once at module load time
  // (not per getValue()), so data seeded after that point won't be caught by it.
  // Detect a stored legacy record (has blue/red, no prompt) and convert here too.
  // Cast to LegacyRules so we can inspect the pre-contract fields in stored data.
  const legacy = saved as LegacyRules;
  if (!legacy.prompt?.trim() && (legacy.blue?.length || legacy.red?.length)) {
    merged.prompt = promptFromLegacy(legacy);
  }
  return merged;
}

export async function setRules(r: Rules): Promise<void> {
  await rulesItem.setValue(r);
}
