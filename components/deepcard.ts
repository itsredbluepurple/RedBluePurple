import type { DeepResult } from '../lib/types';
import { VERDICT_LABEL } from '../lib/verdict';

let current: HTMLElement | null = null;

export function closeDeepCard(): void {
  current?.remove();
  current = null;
}

export function openDeepCard(anchor: HTMLElement, result: Promise<DeepResult>): void {
  closeDeepCard();
  const card = document.createElement('div');
  card.className = 'rbp-deep loading';
  card.innerHTML = `<div class="rbp-deep-body">Researching…</div>`;
  (anchor.closest('.card, li, article') ?? document.body).appendChild(card);
  current = card;
  result.then((r) => {
    if (current !== card) return; // superseded
    card.classList.remove('loading');
    card.innerHTML = render(r);
    card.querySelector('[data-close]')?.addEventListener('click', closeDeepCard);
  }).catch((err) => {
    if (current !== card) return;
    card.classList.remove('loading');
    const body = card.querySelector('.rbp-deep-body') ?? card;
    body.textContent = 'Research failed';
    card.querySelector('[data-close]')?.addEventListener('click', closeDeepCard);
  });
}

function li(items: string[]): string {
  return items.map((t) => `<li>${escapeHtml(t)}</li>`).join('');
}

function escapeHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function render(r: DeepResult): string {
  const chip = r.verdict
    ? `<span class="rbp-deep-chip ${r.verdict}">${VERDICT_LABEL[r.verdict]}</span>`
    : '';
  return `
    <div class="rbp-deep-head">
      <b>${escapeHtml(r.company)}</b>${chip}
      <button data-close aria-label="close">×</button>
    </div>
    <div class="rbp-deep-cols">
      <div class="why pro"><h4>Fits your criteria</h4><ul>${li(r.pros)}</ul></div>
      <div class="why con"><h4>Against your criteria</h4><ul>${li(r.cons)}</ul></div>
    </div>
    <div class="rbp-deep-foot">
      <span>${r.rating ?? '—'}★</span>
      <span>${escapeHtml(r.size ?? '—')}</span>
      <ul style="list-style:none;padding:0;margin:0">${li(r.news)}</ul>
      <em>Researched on open</em>
    </div>`;
}
