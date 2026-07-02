import { defineContentScript, browser } from '#imports';
import './style.css';
import { pickAdapter } from '../../lib/placement/adapter';
import type { RawListing } from '../../lib/placement/adapter';
import { createBadge, setVerdict, selectBadge, deselectAll } from '../../components/badge';
import { createNavigator } from '../../components/navigator';
import type { NavEntry } from '../../components/navigator';
import { getRules } from '../../lib/storage';
import { SessionCache, fnv1a } from '../../lib/cache';
import { SCAN_PORT, DEEP_MSG } from '../../lib/messaging';
import type { ScanRequest, ScanStreamMsg } from '../../lib/messaging';
import type { ScanInput, CompanyVerdict, Verdict, DeepResult } from '../../lib/types';
import { openDeepCard } from '../../components/deepcard';
import { log } from '../../lib/log';

// A company-name node that has no box (zero size) or is display:none/visibility:hidden
// is a hidden duplicate the host page keeps in the DOM — not a real, badgeable listing.
// Off-screen-but-sized cards (below the fold) are still visible by this test.
function isVisible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const cs = getComputedStyle(el);
  return cs.display !== 'none' && cs.visibility !== 'hidden';
}

export default defineContentScript({
  matches: ['*://*.indeed.com/*', '*://*.glassdoor.com/*'],
  // CSS is injected into the page (light DOM) via the manifest so it can style
  // the inline badges that live inside host-page listing nodes. No Shadow DOM.
  async main(ctx) {
    const adapter = pickAdapter(location.href);
    if (!adapter) return;
    const rules = await getRules();

    // Nudge: a small dismissible pill, reused for the no-key prompt and for
    // surfacing real scan failures — a rejected key must never be a silent no-op.
    let currentNudge: HTMLElement | null = null;
    const removeNudge = () => { currentNudge?.remove(); currentNudge = null; };
    const openOptions = () => browser.runtime.sendMessage({ kind: 'rbp-open-options' });
    function showNudge(text: string, action?: { label: string; onClick: () => void }) {
      removeNudge();
      const n = document.createElement('div');
      n.className = 'rbp-nudge';
      const t = document.createElement('span');
      t.className = 'rbp-nudge-text';
      t.textContent = text;
      n.appendChild(t);
      if (action) {
        const b = document.createElement('button');
        b.className = 'rbp-nudge-btn';
        b.textContent = action.label;
        b.addEventListener('click', action.onClick);
        n.appendChild(b);
      }
      const x = document.createElement('button');
      x.className = 'rbp-nudge-x';
      x.setAttribute('aria-label', 'Dismiss');
      x.textContent = '×';
      x.addEventListener('click', removeNudge);
      n.appendChild(x);
      document.body.appendChild(n);
      currentNudge = n;
    }
    ctx.onInvalidated(removeNudge);

    // No key or no prompt → never fabricate verdicts. Nudge with the missing piece and stop.
    if (!rules.apiKey || !rules.prompt.trim()) {
      log.info('scan:not_configured', { hasKey: !!rules.apiKey, hasPrompt: !!rules.prompt.trim() });
      const msg = !rules.apiKey
        ? 'Red Blue Purple: add your Anthropic API key in Settings, then refresh this page to scan.'
        : 'Red Blue Purple: describe what you\'re looking for in Settings, then refresh this page to scan.';
      showNudge(msg, { label: 'Open Settings', onClick: openOptions });
      return;
    }

    const cache = new SessionCache(fnv1a(rules.prompt.trim()));
    await cache.hydrate();

    let persistTimer: number | undefined;
    function schedulePersist() {
      clearTimeout(persistTimer);
      persistTimer = window.setTimeout(() => {
        cache.persist().catch((e) => log.warn('cache:persist_failed', { reason: String(e) }));
      }, 1000);
    }
    ctx.onInvalidated(() => clearTimeout(persistTimer));

    // Tracking: listing id -> { badge, verdict, anchor }.
    // 'unknown' is a local sentinel for not-yet-scanned listings; it is NOT part
    // of the shared Verdict union and is filtered out of nav entries.
    interface Tracked { id: string; badge: HTMLSpanElement; verdict: Verdict | 'unknown'; anchor: HTMLElement; company: string }
    const tracked = new Map<string, Tracked>();
    let nextId = 0;

    // Respond to popup's request for per-tab verdict tallies.
    // Returns a resolved Promise so the channel closes immediately (no "message
    // channel closed before a response was received" warning on Chrome builds).
    browser.runtime.onMessage.addListener((msg) => {
      if (msg?.kind !== 'rbp-counts') return;
      const c = { aligned: 0, mixed: 0, flagged: 0, neutral: 0, scanning: 0 };
      for (const t of tracked.values()) {
        if (t.verdict === 'aligned') c.aligned++;
        else if (t.verdict === 'mixed') c.mixed++;
        else if (t.verdict === 'flagged') c.flagged++;
        else if (t.verdict === 'neutral') c.neutral++;
        else if (t.verdict === 'unknown') c.scanning++;
      }
      return Promise.resolve(c);
    });

    // Light-DOM navigator: append directly to the page body, styled by the
    // injected stylesheet.
    const nav = createNavigator({
      getEntries: navEntries,
      onActiveChange: () => {},
    });
    document.body.appendChild(nav.el);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') nav.step(1);
      if (e.key === 'ArrowUp' || e.key === 'k') nav.step(-1);
      if (e.key === 'Escape') { document.body.classList.remove('rbp-focusing'); deselectAll(document.body); }
    };
    window.addEventListener('keydown', onKey);
    ctx.onInvalidated(() => window.removeEventListener('keydown', onKey));

    function navEntries(): NavEntry[] {
      const out: NavEntry[] = [];
      const stale: string[] = [];
      for (const t of tracked.values()) {
        // The host is a SPA: it can re-render a card and detach our badge. Drop
        // those stale entries so the count and Prev/Next only see live badges
        // (the re-rendered card gets a fresh badge via the MutationObserver).
        if (!t.badge.isConnected) { stale.push(t.id); continue; }
        if (t.verdict === 'unknown') continue;
        out.push({
          id: t.id,
          verdict: t.verdict,
          onSelect: () => focus(t),
        });
      }
      for (const id of stale) tracked.delete(id);
      return out;
    }

    function focus(t: Tracked) {
      deselectAll(document.body);
      document.body.classList.add('rbp-focusing');
      selectBadge(t.badge);
      nav.setActiveId(t.id); // keep Prev/Next continuing from a directly-clicked badge
      // 'nearest' = no scroll if already on screen (e.g. auto-selecting the first),
      // and a minimal scroll otherwise.
      t.anchor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // place a scanning chip for any new, un-tracked listing
    function place(): RawListing[] {
      const fresh: RawListing[] = [];
      for (const row of adapter!.collect(document)) {
        if ((row.anchor as any).__rbp) continue; // already badged
        if (!isVisible(row.anchor)) continue; // skip hidden/zero-size duplicate nodes
        (row.anchor as any).__rbp = true;
        const id = String(nextId++);
        const badge = createBadge();
        badge.addEventListener('click', (e) => {
          // The badge lives inside the host's (often clickable) listing — keep the
          // click from bubbling into the site's "open job" navigation.
          e.stopPropagation();
          e.preventDefault();
          if (badge.classList.contains('scanning')) return;
          const t = tracked.get(id)!;
          if (badge.classList.contains('sel')) {
            const research = browser.runtime.sendMessage({ kind: DEEP_MSG, company: t.company }) as Promise<DeepResult>;
            openDeepCard(t.anchor, research);
            research.then((res) => {
              // Absent verdict = research failed; never re-color on failure.
              if (res?.verdict && badge.isConnected) {
                setVerdict(badge, res.verdict);
                t.verdict = res.verdict;      // keep tracked state in sync (nav + popup counts read this)
                selectBadge(badge);           // setVerdict rebuilds classes; re-mark the just-clicked badge selected
                // The researched verdict supersedes Tier-1 everywhere, including future
                // cache hits — persist it now, or a host re-render / the next page would
                // re-apply the stale Tier-1 verdict from the cache.
                const reason = (res.verdict === 'aligned' ? res.pros[0] : res.cons[0]) ?? res.pros[0] ?? res.cons[0] ?? badge.title;
                badge.title = reason;
                cache.set(t.company, { c: id, verdict: res.verdict, reason });
                schedulePersist();
                nav.setActiveId(t.id);        // re-render the position label if the new verdict is still visible
                nav.refreshIdle();            // Prev/Next + counts reflect the new verdict
              }
            }).catch(() => {});
          } else {
            focus(t);
          }
        });
        row.anchor.appendChild(badge);
        tracked.set(id, { id, badge, verdict: 'unknown', anchor: row.anchor, company: row.company });
        (row.anchor as any).__rbpId = id;
        fresh.push(row);
      }
      return fresh;
    }

    function applyVerdict(id: string, cv: CompanyVerdict) {
      const t = tracked.get(id);
      if (!t) return;
      t.verdict = cv.verdict;
      setVerdict(t.badge, cv.verdict);
      if (cv.reason) t.badge.title = cv.reason;
      nav.refreshIdle();
    }

    function scan(rows: RawListing[]) {
      const batch: ScanInput[] = rows
        .filter((r) => !cache.has(r.company))
        .map((r) => ({ c: (r.anchor as any).__rbpId as string, company: r.company, text: r.text }));
      // serve cache hits immediately
      for (const r of rows) {
        const hit = cache.get(r.company);
        if (hit) applyVerdict((r.anchor as any).__rbpId, { ...hit, c: (r.anchor as any).__rbpId });
      }
      if (!batch.length) return;
      // The model is asked to echo each company's [id=N] token in `c`, but it can
      // still return the company name instead. Resolve a returned `c` to a real
      // listing id by id first, then by normalized company name.
      const resolveId = (c: string): string | undefined => {
        if (tracked.has(c)) return c;
        const norm = cache.normalize(c);
        const row = rows.find((r) => cache.normalize(r.company) === norm);
        return row ? ((row.anchor as any).__rbpId as string) : undefined;
      };
      const port = browser.runtime.connect({ name: SCAN_PORT });
      // Clear chips that will never resolve (a dropped chunk or a failed request)
      // so those listings degrade to "untagged" instead of spinning forever.
      const clearStuck = (ids: string[]) => {
        for (const cid of ids) {
          const t = tracked.get(cid);
          if (t && t.verdict === 'unknown') {
            t.badge.remove();
            tracked.delete(cid);
          }
        }
        nav.refreshIdle();
      };
      port.onMessage.addListener((m: ScanStreamMsg) => {
        if (m.type === 'verdict') {
          const id = resolveId(m.v.c);
          if (!id) return;
          applyVerdict(id, { ...m.v, c: id });
          const row = rows.find((r) => (r.anchor as any).__rbpId === id);
          if (row) { cache.set(row.company, { ...m.v, c: id }); schedulePersist(); }
        } else if (m.type === 'chunkError') {
          log.warn('scan:chunk_dropped', { count: m.ids.length, reason: m.reason });
          clearStuck(m.ids);
          // A rejected/missing key fails every chunk identically — make it visible.
          if (/\b401\b|api key|x-api-key|unauthor/i.test(m.reason)) {
            showNudge('Your Anthropic API key was rejected. Check it in Settings.', {
              label: 'Open Settings',
              onClick: openOptions,
            });
          }
        } else if (m.type === 'error') {
          log.error('scan:request_failed', { reason: m.message });
          clearStuck(batch.map((b) => b.c));
          showNudge(`Scan failed: ${m.message.slice(0, 140)}`);
          port.disconnect();
        } else if (m.type === 'done') {
          // A company the model omitted (or whose verdict was dropped as malformed)
          // would otherwise keep its chip spinning — reconcile any still-unscanned.
          clearStuck(batch.map((b) => b.c));
          nav.selectFirstIfNone(); // land on the first badge once results settle
          port.disconnect();
        }
      });
      port.postMessage({ batch, rules } satisfies ScanRequest);
    }

    // initial pass
    scan(place());

    // re-scan as Indeed/Glassdoor inject more cards on scroll. The observer
    // watches the whole body subtree and our own badge/nav insertions also
    // mutate it, so coalesce bursts into a single re-collect per frame rather
    // than running a full adapter.collect() on every mutation.
    let rescanQueued = false;
    const obs = new MutationObserver(() => {
      if (rescanQueued) return;
      rescanQueued = true;
      requestAnimationFrame(() => {
        rescanQueued = false;
        const fresh = place();
        if (fresh.length) scan(fresh);
        // A host re-render can detach the selected/badged card and we re-badge +
        // cache-resolve it here (no 'done' fires) — re-ensure a live selection and
        // refresh the count so the highlight follows the live badge.
        nav.selectFirstIfNone();
        nav.refreshIdle();
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
    ctx.onInvalidated(() => {
      obs.disconnect();
      nav.el.remove();
    });
  },
});
