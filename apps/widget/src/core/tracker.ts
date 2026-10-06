import { store } from './store';
import type { SearchFilters } from '@/types';

// Visitor analytics for the client's dashboard (Analytics, Website Health,
// the Monday email). The widget rewrite dropped every tracking call, so
// nothing was recorded until 2026-10-06. Fire-and-forget: a failed beacon
// never touches the page. Nothing personal is sent: a random id per browser
// tab session, the property, the search filters.

const SESSION_KEY = 'spm_sid';
let sessionId: string | null = null;

export function trackingSession(): string {
  if (sessionId) return sessionId;
  try {
    sessionId = sessionStorage.getItem(SESSION_KEY);
  } catch { /* storage blocked */ }
  if (!sessionId) {
    sessionId = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    try { sessionStorage.setItem(SESSION_KEY, sessionId); } catch { /* storage blocked */ }
  }
  return sessionId;
}

function enabled(): { apiUrl: string; apiKey: string } | null {
  const { apiUrl, apiKey, enableTracking } = store.getState().config;
  if (enableTracking === false) return null;
  // Dashboard previews (spmpv_ tokens) are the client looking at designs, not visitors.
  if (!apiUrl || !apiKey || apiKey.startsWith('spmpv_')) return null;
  if (typeof navigator !== 'undefined' && (navigator as Navigator & { webdriver?: boolean }).webdriver) return null;
  return { apiUrl: apiUrl.replace(/\/$/, ''), apiKey };
}

function send(path: string, body: unknown, method: 'POST' | 'DELETE' = 'POST'): void {
  const target = enabled();
  if (!target) return;
  try {
    // keepalive: a card click leaves the page; the beacon still arrives.
    void fetch(`${target.apiUrl}/api${path}`, {
      method,
      keepalive: true,
      headers: { 'Content-Type': 'application/json', 'X-API-Key': target.apiKey },
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    }).catch(() => {});
  } catch { /* old browser */ }
}

// The filters worth counting: what the visitor asked for, not paging or sort.
function searchFilters(filters: SearchFilters): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filters || {})) {
    if (['page', 'limit', 'sortBy', 'sortOrder', 'sort'].includes(k)) continue;
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    out[k] = v;
  }
  return out;
}

let lastSearch = '';

/** A search the visitor ran (or a page opened with filters). Paging the same search is not a new one. */
export function trackSearch(filters: SearchFilters, resultsCount: number, opts?: { skipEmpty?: boolean }): void {
  const f = searchFilters(filters);
  const key = JSON.stringify(f);
  // A plain listing page (no filters) is a page view, not a search.
  if (opts?.skipEmpty && !Object.keys(f).length) {
    lastSearch = key;
    return;
  }
  if (key === lastSearch) return;
  lastSearch = key;
  send('/v1/track/search', { sessionId: trackingSession(), filters: f, resultsCount: Math.max(0, resultsCount | 0) });
}

const viewed = new Set<number>();

export function trackView(propertyId: number): void {
  if (!propertyId || viewed.has(propertyId)) return;
  viewed.add(propertyId);
  send('/v1/track/view', { propertyId, sessionId: trackingSession(), referrer: document.referrer ? document.referrer.slice(0, 500) : undefined });
}

export function trackPdf(propertyId: number): void {
  if (propertyId) send('/v1/track/pdf', { propertyId, sessionId: trackingSession() });
}

/**
 * Starts the store-driven events once per page: a property opened (detail
 * page) and wishlist adds/removes. Card clicks come from the cards.
 */
export function startTracking(): void {
  if (typeof window === 'undefined' || (window as Window & { __spmTracking?: boolean }).__spmTracking) return;
  (window as Window & { __spmTracking?: boolean }).__spmTracking = true;

  const current = store.getState().selectedProperty;
  if (current?.id) trackView(current.id);
  store.subscribeSlice('selectedProperty', (p) => { if (p?.id) trackView(p.id); });

  let favorites = [...store.getState().favorites];
  store.subscribeSlice('favorites', (next) => {
    for (const id of next) if (!favorites.includes(id)) send('/v1/favorites', { propertyId: id, sessionId: trackingSession() });
    for (const id of favorites) if (!next.includes(id)) send(`/v1/favorites/${id}?sessionId=${encodeURIComponent(trackingSession())}`, null, 'DELETE');
    favorites = [...next];
  });
}

/** A visitor opened a property from a listing card (Analytics → Card Clicks). */
export function trackCardClick(propertyId: number): void {
  if (!propertyId) return;
  const { results, filters } = store.getState();
  send('/v1/track/search', {
    sessionId: trackingSession(),
    filters: searchFilters(filters),
    resultsCount: results?.meta?.total ?? 0,
    clickedPropertyId: propertyId,
  });
}
