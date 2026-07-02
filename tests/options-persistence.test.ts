import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fakeBrowser } from 'wxt/testing';
import { readRulesFromDom, applyRulesToDom, initPage } from '../entrypoints/options/main';
import { DEFAULT_RULES, getRules } from '../lib/storage';

function mountOptions() {
  const html = readFileSync(resolve(__dirname, '../entrypoints/options/index.html'), 'utf8');
  document.documentElement.innerHTML = html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<link[^>]*>/g, '');
}

describe('options persistence helpers', () => {
  it('round-trips prompt + apiKey through the DOM', () => {
    mountOptions();
    const rules = { prompt: 'Want B2B SaaS product roles; avoid layoffs.', apiKey: 'sk-ant-xyz' };
    applyRulesToDom(document, rules as any);
    const read = readRulesFromDom(document);
    expect(read.prompt).toBe('Want B2B SaaS product roles; avoid layoffs.');
    expect(read.apiKey).toBe('sk-ant-xyz');
  });
});

describe('prompt auto-save', () => {
  beforeEach(() => fakeBrowser.reset());

  it('saves prompt to storage on input event', async () => {
    mountOptions();
    await initPage();

    const textarea = document.getElementById('prompt') as HTMLTextAreaElement;
    textarea.value = 'B2B SaaS product roles, avoid layoffs';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    // Let setRules (async) resolve
    await new Promise<void>((r) => setTimeout(r, 0));

    const stored = await getRules();
    expect(stored.prompt).toBe('B2B SaaS product roles, avoid layoffs');
  });
});
