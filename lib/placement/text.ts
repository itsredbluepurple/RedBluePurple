// Walk up from a company-name node to the listing card: the nearest ancestor
// that contains a job-title element. Falls back to the parent element.
export function listingText(anchor: HTMLElement, titleSelector: string): string {
  let el: HTMLElement | null = anchor;
  for (let i = 0; i < 8 && el; i++) {
    if (el.querySelector(titleSelector)) break;
    el = el.parentElement;
  }
  const card = el ?? anchor.parentElement ?? anchor;
  return (card.textContent ?? '').replace(/\s+/g, ' ').trim();
}
