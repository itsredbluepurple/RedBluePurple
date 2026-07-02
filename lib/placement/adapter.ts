import { indeedAdapter } from './indeed';
import { glassdoorAdapter } from './glassdoor';

export interface RawListing {
  anchor: HTMLElement; // company-name element the badge attaches to
  company: string;
  text: string;        // trimmed listing text for the scan
}

export interface SiteAdapter {
  id: string;
  matches(url: string): boolean;
  collect(root: ParentNode): RawListing[];
}

const ADAPTERS: SiteAdapter[] = [indeedAdapter, glassdoorAdapter];

export function pickAdapter(url: string): SiteAdapter | null {
  return ADAPTERS.find((a) => a.matches(url)) ?? null;
}

export { indeedAdapter, glassdoorAdapter };
export { listingText } from './text';
