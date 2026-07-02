import { defineBackground, browser } from '#imports';
import { SCAN_PORT, DEEP_MSG } from '../lib/messaging';
import type { ScanRequest, ScanStreamMsg, DeepRequest } from '../lib/messaging';
import { haikuScanner } from '../lib/scanner/haiku';
import { runScan, validateScanBatch, validateRules } from '../lib/scanner/runner';
import { sonnetDeep } from '../lib/deep/sonnet';
import { getRules } from '../lib/storage';
import { log } from '../lib/log';
import type { DeepResult } from '../lib/types';

const MAX_COMPANY_LEN = 200;

// A valid, non-throwing DeepResult that surfaces the reason in the card's cons column.
// verdict is omitted — a failed/unattempted research pass must never re-color a badge.
function deepFallback(company: string, reason: string): DeepResult {
  return { company, rating: null, size: null, news: [], pros: [], cons: [reason], researchedAt: Date.now() };
}

export default defineBackground(() => {
  // Open the options page when the content nudge asks (content scripts can't call
  // openOptionsPage directly).
  browser.runtime.onMessage.addListener((msg: { kind?: string }) => {
    if (msg?.kind === 'rbp-open-options') browser.runtime.openOptionsPage();
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== SCAN_PORT) return;
    port.onMessage.addListener(async (req: ScanRequest) => {
      const send = (m: ScanStreamMsg) => port.postMessage(m);
      // Boundary: treat the Port payload as untrusted.
      if (!validateScanBatch(req?.batch) || !validateRules(req?.rules)) {
        log.error('scan:bad_request', {});
        send({ type: 'error', message: 'Invalid scan request' });
        return;
      }
      // Real analysis requires the user's key and a non-empty prompt — the
      // production runtime never fabricates verdicts.
      if (!req.rules.apiKey || !req.rules.prompt?.trim()) {
        log.error('scan:not_configured', {});
        send({ type: 'error', message: 'No API key or prompt set' });
        return;
      }
      log.info('scan:request', { companies: req.batch.length });
      try {
        await runScan(haikuScanner, req.batch, req.rules, {
          verdict: (v) => send({ type: 'verdict', v }),
          chunkError: (ids, reason) => send({ type: 'chunkError', ids, reason }),
        });
        send({ type: 'done' });
      } catch (e) {
        // runScan isolates per-chunk failures; reaching here means something
        // unexpected slipped past — surface it rather than hang the content script.
        log.error('scan:fatal', { reason: e instanceof Error ? e.message : String(e) });
        send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    });
  });

  // Deep-research handler — real Sonnet web search; requires a key, never mocked.
  browser.runtime.onMessage.addListener((msg: DeepRequest, _sender, sendResponse) => {
    if (msg?.kind !== DEEP_MSG) return;
    // Boundary: company name comes from the page DOM — trim, cap length, reject empty.
    const company = typeof msg.company === 'string' ? msg.company.trim().slice(0, MAX_COMPANY_LEN) : '';
    if (!company) {
      log.error('deep:bad_request', {});
      sendResponse(deepFallback('', 'No company name provided'));
      return true;
    }
    (async () => {
      const rules = await getRules();
      if (!rules.apiKey) {
        sendResponse(deepFallback(company, 'Add your Anthropic API key in Settings to research companies'));
        return;
      }
      try {
        sendResponse(await sonnetDeep.research(company, rules));
      } catch (e) {
        log.error('deep:failed', { company, reason: (e as Error).message });
        sendResponse(deepFallback(company, `Research failed: ${(e as Error).message}`));
      }
    })();
    return true; // async response
  });
});
