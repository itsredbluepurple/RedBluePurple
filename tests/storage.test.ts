import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { getRules, setRules, DEFAULT_RULES, promptFromLegacy } from '../lib/storage';

describe('promptFromLegacy', () => {
  it('turns legacy blue/red tags into a starter prompt', () => {
    const p = promptFromLegacy({ blue: ['Growing', 'Remote-friendly'], red: ['Recent layoffs'] });
    expect(p).toContain('Growing');
    expect(p).toContain('Remote-friendly');
    expect(p).toContain('Recent layoffs');
    expect(p.toLowerCase()).toContain('avoid');
  });
  it('is empty when there are no legacy tags', () => {
    expect(promptFromLegacy({})).toBe('');
    expect(promptFromLegacy({ apiKey: 'sk-ant-x' })).toBe('');
  });
});

describe('rules storage', () => {
  beforeEach(() => fakeBrowser.reset());

  it('returns defaults when nothing is stored', async () => {
    const r = await getRules();
    expect(r.prompt).toBe('');
    expect(r.apiKey).toBe('');
  });

  it('round-trips a saved value', async () => {
    await setRules({ ...DEFAULT_RULES, apiKey: 'sk-test' });
    const r = await getRules();
    expect(r.apiKey).toBe('sk-test');
    expect(r.prompt).toBe('');
  });

  it('merges missing fields over defaults', async () => {
    // WXT resolveKey splits 'local:rbp:rules' at first ':' → area='local', driverKey='rbp:rules'
    // So the actual chrome.storage.local key is 'rbp:rules', not 'local:rbp:rules'
    await fakeBrowser.storage.local.set({ 'rbp:rules': { apiKey: 'sk-partial' } });
    const r = await getRules();
    expect(r.apiKey).toBe('sk-partial');
    expect(r.prompt).toBe('');
  });

  it('getRules migrates a legacy stored record into a prompt', async () => {
    // Seed a v1-style record at the real storage key (WXT strips the 'local:' area prefix).
    await fakeBrowser.storage.local.set({ 'rbp:rules': { blue: ['Growing headcount'], red: ['Recent layoffs'], apiKey: 'sk-ant-legacy' } });
    const r = await getRules();
    expect(r.prompt).toContain('Growing headcount');
    expect(r.prompt).toContain('Recent layoffs');
    expect(r.apiKey).toBe('sk-ant-legacy');
  });
});
