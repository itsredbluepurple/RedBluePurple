import type { Verdict } from '../lib/types';
import { VERDICT_LABEL } from '../lib/verdict';

export function createBadge(): HTMLSpanElement {
  const b = document.createElement('span');
  b.className = 'rbp-badge scanning';
  b.innerHTML = '<span class="dot"></span><span class="lbl">Scanning</span>';
  return b;
}

export function setVerdict(badge: HTMLSpanElement, v: Verdict): void {
  badge.className = `rbp-badge ${v} pop`;
  badge.innerHTML = `<span class="dot"></span><span class="lbl">${VERDICT_LABEL[v]}</span>`;
  badge.addEventListener(
    'animationend',
    () => badge.classList.remove('pop'),
    { once: true },
  );
}

export function selectBadge(badge: HTMLSpanElement): void {
  badge.classList.add('sel');
}

export function deselectAll(container: ParentNode): void {
  container.querySelectorAll('.rbp-badge.sel').forEach((b) => b.classList.remove('sel'));
}
