import { describe, it, expect, vi } from 'vitest';
import { createNavigator } from '../components/navigator';

type V = 'aligned' | 'mixed' | 'flagged';

// Mirror the real orchestrator: getEntries() rebuilds FRESH entry objects on every
// call (so the navigator cannot rely on object identity), but keeps stable ids and
// stable onSelect spies keyed by id.
function makeSource(verdicts: V[]) {
  const spies = verdicts.map(() => vi.fn());
  const getEntries = () =>
    verdicts.map((verdict, i) => ({ id: String(i), verdict, onSelect: spies[i] }));
  return { getEntries, spies };
}

describe('navigator', () => {
  it('cycles forward through every active entry across fresh getEntries() calls', () => {
    const { getEntries, spies } = makeSource(['aligned', 'mixed', 'flagged']);
    const nav = createNavigator({ getEntries, onActiveChange: () => {} });
    nav.step(1);
    expect(spies[0]).toHaveBeenCalledTimes(1);
    nav.step(1);
    expect(spies[1]).toHaveBeenCalledTimes(1);
    nav.step(1);
    expect(spies[2]).toHaveBeenCalledTimes(1);
    nav.step(1); // wraps back to the first
    expect(spies[0]).toHaveBeenCalledTimes(2);
  });

  it('steps backward (and wraps) by id, not object identity', () => {
    const { getEntries, spies } = makeSource(['aligned', 'mixed', 'flagged']);
    const nav = createNavigator({ getEntries, onActiveChange: () => {} });
    nav.step(-1); // first Prev lands on the last entry
    expect(spies[2]).toHaveBeenCalledTimes(1);
    nav.step(-1);
    expect(spies[1]).toHaveBeenCalledTimes(1);
  });

  it('continues from a directly-selected badge via setActiveId', () => {
    const { getEntries, spies } = makeSource(['aligned', 'mixed', 'flagged']);
    const nav = createNavigator({ getEntries, onActiveChange: () => {} });
    nav.setActiveId('0'); // user clicked the first badge
    nav.step(1); // Next should advance to the SECOND, not restart at the first
    expect(spies[1]).toHaveBeenCalledTimes(1);
    expect(spies[0]).not.toHaveBeenCalled();
  });

  it('disabling a verdict removes it from the cycle (min one stays on)', () => {
    const { getEntries, spies } = makeSource(['aligned', 'flagged']);
    const nav = createNavigator({ getEntries, onActiveChange: () => {} });
    (nav.el.querySelector('[data-filt="flagged"]') as HTMLElement).click();
    expect(nav.active.has('flagged')).toBe(false);
    nav.step(1);
    nav.step(1); // should only ever hit aligned (id 0)
    expect(spies[1]).not.toHaveBeenCalled();
    expect(spies[0]).toHaveBeenCalled();
  });

  it('selectFirstIfNone auto-selects the first entry, but only when nothing is selected', () => {
    const { getEntries, spies } = makeSource(['aligned', 'mixed']);
    const nav = createNavigator({ getEntries, onActiveChange: () => {} });
    nav.selectFirstIfNone();
    expect(spies[0]).toHaveBeenCalledTimes(1);
    nav.selectFirstIfNone(); // already on first → no-op
    expect(spies[0]).toHaveBeenCalledTimes(1);
  });

  it('setActiveId updates the readout so a clicked badge is not stuck on "—"', () => {
    const { getEntries } = makeSource(['aligned', 'mixed', 'flagged']);
    const nav = createNavigator({ getEntries, onActiveChange: () => {} });
    const pos = nav.el.querySelector('.pos') as HTMLElement;
    nav.setActiveId('1'); // as if the user clicked the 2nd badge
    expect(pos.textContent).toContain('2');
    expect(pos.textContent).toMatch(/of 3/);
  });

  it('refreshIdle shows a running count while nothing is selected', () => {
    const { getEntries } = makeSource(['aligned', 'mixed', 'flagged']);
    const nav = createNavigator({ getEntries, onActiveChange: () => {} });
    const pos = nav.el.querySelector('.pos') as HTMLElement;
    nav.refreshIdle();
    expect(pos.textContent).toContain('3');
    nav.step(1); // now a selection exists
    nav.refreshIdle(); // must not overwrite the selection's position
    expect(pos.textContent).toMatch(/of 3/);
  });

  it('selectFirstIfNone does not steal the selection when the current entry is still in getEntries() but hidden by the active filter', () => {
    // Mirrors a deep re-color to 'neutral' (default-OFF filter): the badge is still
    // live (getEntries() returns it) but activeList() drops it. The user is reading
    // the deep card for that badge — selectFirstIfNone must leave the selection alone.
    const verdicts: V[] = ['aligned', 'mixed', 'flagged'];
    const spies = verdicts.map(() => vi.fn());
    let hiddenVerdict: string = 'aligned'; // selected entry's verdict, mutated to simulate re-color
    const getEntries = () =>
      verdicts.map((verdict, i) => ({ id: String(i), verdict: (i === 0 ? hiddenVerdict : verdict) as V, onSelect: spies[i] }));
    const nav = createNavigator({ getEntries, onActiveChange: () => {} });
    nav.setActiveId('0'); // select the first entry directly (as a badge click would)
    const pos = nav.el.querySelector('.pos') as HTMLElement;
    const before = pos.textContent;
    hiddenVerdict = 'neutral'; // re-color: neutral filter is OFF by default, so entry 0 drops out of activeList()
    nav.selectFirstIfNone();
    expect(spies[0]).not.toHaveBeenCalled();
    expect(spies[1]).not.toHaveBeenCalled();
    expect(spies[2]).not.toHaveBeenCalled();
    expect(pos.textContent).toBe(before); // position label untouched
  });

  it('selectFirstIfNone still recovers to the first entry when the selected id is genuinely gone (disconnected badge)', () => {
    const { getEntries, spies } = makeSource(['aligned', 'mixed']);
    const nav = createNavigator({ getEntries, onActiveChange: () => {} });
    nav.setActiveId('5'); // an id no longer present at all (e.g. detached badge dropped by getEntries())
    nav.selectFirstIfNone();
    expect(spies[0]).toHaveBeenCalledTimes(1);
  });

  it('refuses to turn the last active filter off', () => {
    const nav = createNavigator({ getEntries: () => [], onActiveChange: () => {} });
    nav.active.forEach((v) => {
      (nav.el.querySelector(`[data-filt="${v}"]`) as HTMLElement)?.click();
    });
    expect(nav.active.size).toBeGreaterThanOrEqual(1);
  });

  it('renders the neutral filter OFF by default while aligned/mixed/flagged start ON', () => {
    const nav = createNavigator({ getEntries: () => [], onActiveChange: () => {} });
    expect(nav.active.has('neutral' as any)).toBe(false);
    for (const v of ['aligned', 'mixed', 'flagged']) {
      expect((nav.el.querySelector(`[data-filt="${v}"]`) as HTMLElement).classList.contains('on')).toBe(true);
    }
    expect((nav.el.querySelector('[data-filt="neutral"]') as HTMLElement).classList.contains('on')).toBe(false);
  });
});
