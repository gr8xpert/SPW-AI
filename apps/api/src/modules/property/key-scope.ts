import { createHash } from 'crypto';
import type { ApiKeyFilters, ApiKeyScope, ApiKeySettings, ListingType } from '@spm/shared';
import { LISTING_TYPES } from './site-limits';

// A website key's scope (api_keys.scope), cleaned so only what it can mean
// reaches a query. Anything unknown, empty or out of range is dropped; a scope
// left with nothing shows everything.

const ids = (raw: unknown, max = 500): number[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const out = [...new Set(raw.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, max);
  return out.length ? out : undefined;
};

const price = (raw: unknown): number | undefined => {
  const n = Number(raw);
  return raw != null && raw !== '' && Number.isFinite(n) && n > 0 ? n : undefined;
};

function cleanFilters(r: Record<string, unknown>): ApiKeyFilters {
  const out: ApiKeyFilters = {};
  const locationIds = ids(r.locationIds);
  if (locationIds) out.locationIds = locationIds;
  const propertyTypeIds = ids(r.propertyTypeIds);
  if (propertyTypeIds) out.propertyTypeIds = propertyTypeIds;
  const features = ids(r.features, 50);
  if (features) {
    out.features = features;
    out.featureMatch = r.featureMatch === 'any' ? 'any' : 'all';
  }
  const range = (minKey: 'priceMin' | 'bedsMin' | 'bathsMin', maxKey: 'priceMax' | 'bedsMax' | 'bathsMax') => {
    const min = price(r[minKey]);
    const max = price(r[maxKey]);
    if (min) out[minKey] = min;
    if (max && (!min || max >= min)) out[maxKey] = max;
  };
  range('priceMin', 'priceMax');
  range('bedsMin', 'bedsMax');
  range('bathsMin', 'bathsMax');
  if (r.ownOnly === true) out.ownOnly = true;
  if (r.featuredOnly === true) out.featuredOnly = true;
  return out;
}

// One filter set per listing type that is on. Types left out don't show.
function cleanByListingType(raw: unknown): Partial<Record<ListingType, ApiKeyFilters>> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Partial<Record<ListingType, ApiKeyFilters>> = {};
  for (const type of LISTING_TYPES) {
    const tab = (raw as Record<string, unknown>)[type];
    if (!tab || typeof tab !== 'object' || Array.isArray(tab)) continue;
    out[type] = cleanFilters(tab as Record<string, unknown>);
  }
  return Object.keys(out).length ? out : null;
}

export function cleanKeyScope(raw: unknown): ApiKeyScope | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const byType = cleanByListingType(r.byListingType);
  const tabs = byType ? Object.values(byType) : [];
  // Tabs that all say the same are a plain scope: simpler everywhere, and the
  // query needs no OR.
  const same = byType && tabs.every((tab) => JSON.stringify(tab) === JSON.stringify(tabs[0]));
  const scope: ApiKeyScope = byType && !same ? {} : cleanFilters(byType ? { ...tabs[0] } : r);
  if (byType && !same) scope.byListingType = byType;
  const rawTypes = byType ? Object.keys(byType) : r.listingTypes;
  if (Array.isArray(rawTypes)) {
    const types = [...new Set(rawTypes.filter((t): t is (typeof LISTING_TYPES)[number] =>
      typeof t === 'string' && (LISTING_TYPES as readonly string[]).includes(t)))];
    if (types.length && types.length < LISTING_TYPES.length) scope.listingTypes = types;
  }
  if (Array.isArray(r.excludeRefs)) {
    const refs = [...new Set(r.excludeRefs.filter((s): s is string => typeof s === 'string').map((s) => s.trim()).filter(Boolean))]
      .map((s) => s.slice(0, 100))
      .slice(0, 1000);
    if (refs.length) scope.excludeRefs = refs;
  }
  return Object.keys(scope).length ? scope : null;
}

// The listing types a page may show: the site's own limit (Settings -> Widget)
// and the key's, together. Null means every type. When the two share none the
// list holds a value no listing has, since an empty list reads as "no limit".
export function scopedListingTypes(site: string[] | null, scope: ApiKeyScope | null | undefined): string[] | null {
  const keyTypes = scope?.listingTypes?.length ? scope.listingTypes : null;
  if (!keyTypes) return site;
  if (!site) return keyTypes;
  const both = site.filter((t) => (keyTypes as string[]).includes(t));
  return both.length ? both : ['none'];
}

// The places (or types) a scoped site's dropdowns start from. With different
// filters per listing type it's all of them together; a type with no limit
// there means the whole list.
export function scopeRoots(scope: ApiKeyScope | null | undefined, field: 'locationIds' | 'propertyTypeIds'): number[] | undefined {
  if (!scope?.byListingType) return scope?.[field];
  const all = new Set<number>();
  for (const tab of Object.values(scope.byListingType)) {
    if (!tab?.[field]?.length) return undefined;
    for (const id of tab[field]!) all.add(id);
  }
  return [...all];
}

// Short and stable, for cache tags: two keys with the same scope share it.
export function keyScopeTag(scope: ApiKeyScope | null | undefined): string {
  if (!scope) return '';
  return createHash('sha256').update(JSON.stringify(scope)).digest('hex').slice(0, 12);
}

// The places (or types) a scoped site's dropdowns list: the picked ones, what
// sits below them, and the parents above them so the tree still reads.
// Nothing picked means the whole list.
export function trimToScope<T extends { id: number; parentId?: number | null }>(items: T[], roots: number[] | undefined): T[] {
  if (!roots?.length) return items;
  const byId = new Map(items.map((i) => [i.id, i]));
  const childrenOf = new Map<number, number[]>();
  for (const i of items) {
    if (i.parentId == null) continue;
    const list = childrenOf.get(i.parentId) || [];
    list.push(i.id);
    childrenOf.set(i.parentId, list);
  }
  const keep = new Set<number>();
  const stack = [...roots];
  while (stack.length) {
    const id = stack.pop()!;
    if (keep.has(id)) continue;
    keep.add(id);
    stack.push(...(childrenOf.get(id) || []));
  }
  for (const root of roots) {
    const seen = new Set<number>();
    for (let at = byId.get(root)?.parentId; at != null && !seen.has(at); at = byId.get(at)?.parentId) {
      seen.add(at);
      keep.add(at);
    }
  }
  return items.filter((i) => keep.has(i.id));
}

// Allowed domains as typed in the dashboard ("https://www.example.com/",
// "example.com") down to bare hosts. Up to 20; anything that isn't a host is dropped.
export function cleanAllowedDomains(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const hosts = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const host = item.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split(/[/?#:]/)[0].replace(/^www\./, '').replace(/\.$/, '');
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) && host.length <= 253) hosts.add(host);
    if (hosts.size >= 20) break;
  }
  return hosts.size ? [...hosts] : null;
}

// The site a browser request came from: Origin, else Referer, else the
// plugin's x-spm-site. Null when the request names none (a server call).
export function requestSiteHost(headers: Record<string, unknown> | undefined): string | null {
  for (const name of ['origin', 'referer', 'x-spm-site', 'x-spw-site']) {
    const value = headers?.[name];
    if (typeof value !== 'string' || !value || value === 'null') continue;
    try {
      return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      continue;
    }
  }
  return null;
}

// A domain lock lets the listed hosts and their subdomains through.
export function hostAllowed(host: string, domains: string[]): boolean {
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

// A key's own settings, cleaned like the scope.
export function cleanKeySettings(raw: unknown): ApiKeySettings | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: ApiKeySettings = {};
  if (typeof r.currency === 'string' && /^[A-Z]{3}$/.test(r.currency.trim().toUpperCase())) out.currency = r.currency.trim().toUpperCase();
  if (typeof r.primaryColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.primaryColor.trim())) out.primaryColor = r.primaryColor.trim();
  if (Array.isArray(r.inquiryEmails)) {
    const emails = [...new Set(r.inquiryEmails
      .filter((e): e is string => typeof e === 'string')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254))].slice(0, 10);
    if (emails.length) out.inquiryEmails = emails;
  }
  return Object.keys(out).length ? out : null;
}
