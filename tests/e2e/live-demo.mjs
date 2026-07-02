#!/usr/bin/env node
/**
 * Live end-to-end demo of the Red Blue Purple extension against the REAL Anthropic API.
 *
 * Loads the built unpacked extension into Chromium, serves a fixture results page
 * as www.indeed.com (so the content script matches), seeds rules + your API key into
 * the extension's storage, then drives the real Tier-1 (Haiku) scan, the navigator,
 * and a real Tier-2 (Sonnet web-search) deep card — recording it all to an MP4.
 *
 * Requirements (local/manual, not CI): a display, ffmpeg, a built extension
 * (`npm run build`), and an Anthropic API key in ./.key (ANTHROPIC_API_KEY=sk-ant-...)
 * or the ANTHROPIC_API_KEY env var.
 *
 * Run:  npm run build && npm run e2e
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const EXT = path.join(ROOT, '.output', 'chrome-mv3');
const FIXTURE = path.join(HERE, 'fixtures', 'indeed-demo.html');
const OUT_DIR = path.join(HERE, 'out');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readKey() {
  const keyFile = path.join(ROOT, '.key');
  if (fs.existsSync(keyFile)) {
    return fs.readFileSync(keyFile, 'utf8').replace(/^ANTHROPIC_API_KEY=/, '').trim();
  }
  return (process.env.ANTHROPIC_API_KEY || '').trim();
}

const RULES = {
  // The README's fill-in template, filled for a PM targeting small startups. Dealbreakers
  // are deliberately narrow so a listing outside the criteria's scope entirely — the
  // dental office — lands neutral, not flagged.
  prompt: "I'm looking for: a Product Manager role at a small startup.\n\nGood signs (any of these):\n- Early-stage startup (seed to Series B, roughly under 100 people)\n- Hiring PMs or building out their first product team\n- Shipping a real software product, ideally growing or recently funded\n\nDealbreakers (flag these):\n- Large companies (500+ people) or big public enterprises\n- Recent layoffs or hiring freezes\n- Staffing agencies or consultancies hiring for someone else",
  apiKey: '', // filled below
};

async function main() {
  const apiKey = readKey();
  if (!apiKey) {
    console.error('No API key. Put ANTHROPIC_API_KEY=sk-ant-... in ./.key or the environment.');
    process.exit(1);
  }
  if (!fs.existsSync(path.join(EXT, 'manifest.json'))) {
    console.error(`No built extension at ${EXT}. Run "npm run build" first.`);
    process.exit(1);
  }
  RULES.apiKey = apiKey;
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const html = fs.readFileSync(FIXTURE, 'utf8');
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const ctx = await chromium.launchPersistentContext(path.join(OUT_DIR, 'profile'), {
    headless: false,
    viewport: { width: 1200, height: 900 },
    recordVideo: { dir: path.join(OUT_DIR, 'video'), size: { width: 1200, height: 900 } },
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      `--host-resolver-rules=MAP www.indeed.com 127.0.0.1:${port}`,
      '--no-sandbox',
    ],
  });

  const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent('serviceworker', { timeout: 8000 }));
  await sw.evaluate((rules) => chrome.storage.local.set({ 'rbp:rules': rules }), RULES);

  const page = await ctx.newPage();
  await page.goto('http://www.indeed.com/jobs?q=product+manager', { waitUntil: 'load' });

  await page.waitForSelector('.rbp-badge', { timeout: 8000 });
  await sleep(800);
  await page
    .waitForFunction(
      () => {
        const b = [...document.querySelectorAll('.rbp-badge')];
        return b.length >= 6 && b.every((x) => !x.classList.contains('scanning'));
      },
      { timeout: 40000 },
    )
    .catch(() => console.warn('not all verdicts resolved'));
  console.log('verdicts:', JSON.stringify(await page.$$eval('.rbp-badge', (e) => e.map((x) => x.textContent.trim()))));
  // Frame all six cards (incl. the neutral one at the bottom) for the README shot.
  // Escape first: the nav auto-selects the first result, and the focus state dims
  // every other badge — the still needs all badges at full strength.
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'instant' }));
  await sleep(400);
  await page.screenshot({ path: path.join(OUT_DIR, 'badges.png'), fullPage: false });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await sleep(1800);

  // navigator: step focus through a few badges (the aurora focus border)
  const next = page.locator('.rbp-nav [data-act="next"]');
  for (let i = 0; i < 3; i++) { await next.click(); await sleep(1600); }

  // clear focus, then open a real deep-research card on the first listing
  await page.keyboard.press('Escape');
  await sleep(1000);
  // Deep-dive the real company (XPO, listing 4) so the Sonnet web search returns a rich card.
  const firstBadge = page.locator('[data-testid="company-name"]').nth(3).locator('.rbp-badge');
  await firstBadge.click(); await sleep(1100); // focus
  await firstBadge.click();                    // open deep card (real Sonnet web search)
  await page.waitForSelector('.rbp-deep', { timeout: 5000 }).catch(() => {});
  await sleep(2500); // show the loading state
  // Be patient: the deep call now retries on rate limits/timeouts, so a slow run
  // can legitimately take longer than a single ~20s web-search round trip.
  await page
    .waitForSelector('.rbp-deep:not(.loading)', { timeout: 110000 })
    .catch(() => console.warn('deep card did not resolve'));
  await page.locator('.rbp-deep').scrollIntoViewIfNeeded().catch(() => {});
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT_DIR, 'deepcard.png'), fullPage: false }).catch(() => {});
  await sleep(3800);

  // Options page screenshot (storage-seeded prompt + key render into the form).
  const extId = new URL(sw.url()).host;
  const opts = await ctx.newPage();
  await opts.goto(`chrome-extension://${extId}/options.html`, { waitUntil: 'load' });
  await sleep(2500); // let the reveal animations settle
  await opts.screenshot({ path: path.join(OUT_DIR, 'options.png'), fullPage: false }).catch(() => {});
  await opts.close();
  await page.bringToFront();
  await sleep(600);

  // Persistent-cache proof: reload the results page. Cached verdicts must re-badge
  // near-instantly — a real Haiku batch takes ~6-15s, cache hits render in <3.5s.
  await page.reload({ waitUntil: 'load' });
  const t0 = Date.now();
  const cachedOk = await page
    .waitForFunction(
      () => {
        const b = [...document.querySelectorAll('.rbp-badge')];
        return b.length >= 6 && b.every((x) => !x.classList.contains('scanning'));
      },
      { timeout: 3500 },
    )
    .then(() => true)
    .catch(() => false);
  console.log(cachedOk
    ? `cache: reload re-badged all 6 from storage in ${Date.now() - t0}ms (no rescan)`
    : 'cache: FAIL — reload did not re-badge from cache within 3.5s');
  const stored = await sw.evaluate(async () => {
    const o = await chrome.storage.local.get('rbp:verdictCache:v1');
    const c = o['rbp:verdictCache:v1'];
    return c ? { entries: Object.keys(c.entries).length, hash: !!c.promptHash } : null;
  });
  console.log('cache store:', JSON.stringify(stored));
  await sleep(2500);

  const vid = page.video();
  await ctx.close();
  server.close();

  const webm = await vid.path();
  const mp4 = path.join(OUT_DIR, 'rbp-live-demo.mp4');
  const ff = spawnSync('ffmpeg', [
    '-y', '-i', webm, '-movflags', '+faststart', '-pix_fmt', 'yuv420p',
    '-profile:v', 'baseline', '-level', '3.1', '-c:v', 'libx264', '-preset', 'slow',
    '-crf', '21', '-vf', 'scale=1200:900', mp4,
  ]);
  if (ff.status === 0) console.log('MP4:', mp4);
  else console.log('WEBM (ffmpeg unavailable):', webm);
}

main().catch((e) => { console.error(e); process.exit(1); });
