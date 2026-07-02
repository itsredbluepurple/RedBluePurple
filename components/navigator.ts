/**
 * Navigator component: floating Prev/Next + 4 multi-select toggle filters.
 * Keyboard handling (ArrowDown/j = next, ArrowUp/k = prev) is wired by the orchestrator
 * in Task 9, not here, so the listener can be torn down with the content-script context.
 */

import type { Verdict } from '../lib/types';
import { VERDICT_LABEL } from '../lib/verdict';

type V = Verdict;
// `id` is a stable per-listing key. The entry objects are rebuilt on every
// getEntries() call, so the current selection is tracked by id, never by object
// identity (identity does not survive the rebuild).
export interface NavEntry { id: string; verdict: V; onSelect(): void }
export interface NavigatorOpts {
  getEntries(): NavEntry[];
  onActiveChange(active: Set<V>): void;
}
export interface NavigatorHandle {
  el: HTMLElement;
  active: Set<V>;
  step(dir: 1 | -1): void;
  setPosition(label: string): void;
  setActiveId(id: string | null): void; // sync position when a badge is clicked directly
  refreshIdle(): void;                   // show a running count while nothing is selected
  selectFirstIfNone(): void;             // auto-select the first entry once results settle
}

const FILTERS: { v: V; cls: string }[] = [
  { v: 'aligned', cls: 'b' },
  { v: 'mixed', cls: 'p' },
  { v: 'flagged', cls: 'r' },
  { v: 'neutral', cls: 'n' },
];

export function createNavigator(opts: NavigatorOpts): NavigatorHandle {
  const active = new Set<V>(['aligned', 'mixed', 'flagged']);
  let curId: string | null = null;

  const el = document.createElement('div');
  el.className = 'rbp-nav';
  el.innerHTML = `
    <button data-act="prev">▲</button>
    <span class="pos"><b>—</b></span>
    <button data-act="next">▼ Next</button>
    <span class="sep"></span>
    ${FILTERS.map((f) => `<button class="filt ${f.cls}${active.has(f.v) ? ' on' : ''}" data-filt="${f.v}"><span class="d"></span>${VERDICT_LABEL[f.v]}</button>`).join('')}
  `;

  const pos = el.querySelector('.pos') as HTMLElement;
  function syncFilterButtons() {
    el.querySelectorAll<HTMLElement>('.filt').forEach((b) =>
      b.classList.toggle('on', active.has(b.dataset.filt as V)),
    );
  }
  function activeList(): NavEntry[] {
    return opts.getEntries().filter((e) => active.has(e.verdict));
  }
  function setPosition(label: string) { pos.innerHTML = label; }
  // Position text for a given id, computed against the current active list.
  // Numbers only — the count spans every active filter, so naming the current
  // selection's verdict here would read as if it described the whole set.
  function showPositionFor(id: string) {
    const li = activeList();
    const idx = li.findIndex((e) => e.id === id);
    if (idx >= 0) setPosition(`<b>${idx + 1}</b> of ${li.length}`);
  }
  function select(entry: NavEntry, idx: number, total: number) {
    entry.onSelect();
    setPosition(`<b>${idx + 1}</b> of ${total}`);
  }
  function step(dir: 1 | -1) {
    const li = activeList();
    if (!li.length) return;
    let idx = curId !== null ? li.findIndex((e) => e.id === curId) : -1;
    idx = idx < 0 ? (dir > 0 ? 0 : li.length - 1) : (idx + dir + li.length) % li.length;
    const chosen = li[idx];
    curId = chosen.id;
    select(chosen, idx, li.length);
  }
  // While nothing is selected, show a running count instead of a bare "—".
  function refreshIdle() {
    if (curId !== null) return;
    const n = activeList().length;
    setPosition(n > 0 ? `<b>${n}</b> found` : '<b>—</b>');
  }
  // Keep a live selection: land on the first entry if nothing is selected yet OR
  // the current selection has vanished (the host re-rendered and detached its card).
  function selectFirstIfNone() {
    // Check the UNfiltered entries, not activeList(): a verdict change (e.g. a deep
    // re-color to a default-OFF filter like 'neutral') can drop the selected id out
    // of the active list without the badge itself having vanished. Only a genuinely
    // gone/disconnected id (dropped by getEntries()) should trigger recovery.
    if (curId !== null && opts.getEntries().some((e) => e.id === curId)) return;
    const li = activeList();
    if (!li.length) { curId = null; return; }
    curId = li[0].id;
    select(li[0], 0, li.length);
  }

  el.querySelector('[data-act="next"]')!.addEventListener('click', () => step(1));
  el.querySelector('[data-act="prev"]')!.addEventListener('click', () => step(-1));
  el.querySelectorAll<HTMLElement>('.filt').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.filt as V;
      if (active.has(v) && active.size > 1) active.delete(v);
      else active.add(v);
      syncFilterButtons();
      opts.onActiveChange(active);
      // Drop a selection the filter just hid, then refresh the idle count.
      if (curId !== null && !activeList().some((e) => e.id === curId)) curId = null;
      refreshIdle();
    });
  });

  return {
    el,
    active,
    step,
    setPosition,
    setActiveId: (id) => {
      curId = id;
      // Selecting a badge directly (a click) must update the readout too, not just
      // the internal cursor — otherwise it stays stuck on "—".
      if (id !== null) showPositionFor(id);
      else refreshIdle();
    },
    refreshIdle,
    selectFirstIfNone,
  };
}
