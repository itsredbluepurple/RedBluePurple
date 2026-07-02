import type { SiteAdapter, RawListing } from './adapter';
import { listingText } from './text';

const NAME_SELECTORS = [
  '[data-testid="company-name"]',
  '[data-company-name]',
  'span.companyName',
  'a[data-tn-element="companyName"]',
];
const TITLE_SELECTOR = 'h2.jobTitle, .jobTitle, [data-testid="job-title"]';

export const indeedAdapter: SiteAdapter = {
  id: 'indeed',
  matches: (url) => /(^|\.)indeed\.com$/.test(new URL(url).hostname),
  collect(root) {
    const out: RawListing[] = [];
    const seen = new Set<Element>(); // Guard against duplicate nodes if multiple selectors match the same element

    for (const sel of NAME_SELECTORS) {
      root.querySelectorAll<HTMLElement>(sel).forEach((node) => {
        if (seen.has(node)) return;
        seen.add(node);
        const company = (node.textContent ?? '').trim();
        if (!company) return;
        out.push({ anchor: node, company, text: listingText(node, TITLE_SELECTOR) });
      });
      if (out.length) break; // first selector that matches wins
    }
    return out;
  },
};
