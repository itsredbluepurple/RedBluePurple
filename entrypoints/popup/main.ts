import { browser } from '#imports';

export interface Counts { aligned: number; mixed: number; flagged: number; neutral: number; scanning: number }

export function renderCounts(c: Counts): string {
  const row = (label: string, n: number, cls: string) =>
    `<div class="row ${cls}"><span class="d"></span><span class="lbl">${label}</span><b>${n}</b></div>`;
  return (
    row('Aligned', c.aligned, 'b') +
    row('Mixed', c.mixed, 'p') +
    row('Flagged', c.flagged, 'r') +
    row('Neutral', c.neutral, 'n') +
    (c.scanning ? `<div class="scanning">Scanning ${c.scanning}…</div>` : '')
  );
}

async function init() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const tally = document.getElementById('tally')!;
  try {
    const counts = (await browser.tabs.sendMessage(tab.id!, { kind: 'rbp-counts' })) as Counts;
    tally.innerHTML = renderCounts(counts);
  } catch {
    tally.innerHTML = `<div class="empty">No scan on this page yet.</div>`;
  }
  document.getElementById('opts')!.addEventListener('click', () => browser.runtime.openOptionsPage());
}
if (typeof document !== 'undefined' && document.getElementById('tally')) init();
