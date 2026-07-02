import type { SiteAdapter, RawListing } from './adapter';
import { listingText } from './text';

const NAME_SELECTORS = [
  '.EmployerProfile_compactEmployerName__9MGcV',
  '[class*="EmployerProfile_compactEmployerName"]',
  '[class*="employerName"]',
  '[data-test="employer-name"]',
];
const TITLE_SELECTOR = '[class*="JobCard_jobTitle"], [data-test="job-title"]';

export const glassdoorAdapter: SiteAdapter = {
  id: 'glassdoor',
  matches: (url) => /(^|\.)glassdoor\.(com|co\.\w+)$/.test(new URL(url).hostname),
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
      if (out.length) break;
    }
    return out;
  },
};
