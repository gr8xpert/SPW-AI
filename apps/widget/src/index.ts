import './styles/base.css';
import './styles/components.css';
import './styles/templates.css';
import './styles/animations.css';

import { store } from './core/store';
import { actions } from './core/actions';
import { DataLoader, type BundleData } from './core/data-loader';
import { scanDOM } from './core/dom-scanner';
import { isMounted, mountAll, releaseDetached, remountChangedSiteBlocks } from './core/component-mounter';
import { registerAllComponents } from './registry/component-registry';
import { parseConfig, applyTheme, mergeWithDashboardConfig } from './core/config-parser';
import { parsePrefilledFilters, parseLockedFilters } from './core/attribute-parser';
import { isCurated, liftSearchBlocks, markCuratedBlocksStandalone, RESULT_COMPONENTS } from './core/block-role';
import { installLegacyAPI, setRefreshHandler, setSearchHandler, type SearchOptions } from './core/legacy-api';
import { loadPersistedFavorites } from './hooks/useFavorites';
import { startTracking, trackSearch } from './core/tracker';
import { extractRefCandidates, refFirst } from './core/url-utils';
import { applyPropertySeo } from './core/seo';
import { filtersFromQuery, filtersToQuery, writeSearchToUrl, type NameLists } from './core/search-url';
import type { Property, SearchFilters, SearchResults, WidgetConfig } from './types';
import { navigateTo } from './core/navigate';

let dataLoader: DataLoader | null = null;

// Network work that needs nothing from the page but its config: started the
// moment this script runs instead of at DOMContentLoaded. On a heavy page the
// script runs seconds before DOMContentLoaded (deferred theme scripts still to
// come), and the lists, settings and first search used to wait all that time.
// Mounting still happens at DOMContentLoaded, exactly as before.
interface Boot {
  config: WidgetConfig;
  loader: DataLoader;
  bundle: Promise<BundleData>;
  // The newest live dashboard settings, kept until init() can apply them.
  live: Partial<WidgetConfig> | null;
  earlyDetail: boolean;
  earlyRefs: string[];
  earlyProperty: Promise<Property | null> | null;
  earlyKey: string;
  earlySearch: Promise<SearchResults | null> | null;
}

let boot: Boot | null = null;
let initStarted = false;

// Location, type and feature names on the page need the client's lists to
// become ids; until those arrive the first search can't be known.
const NAMED_LIST_ATTR = /^data-spm-(lock[-_])?(location|area|town|type|property[-_]type|features?)$/;
function pageHasNamedListFilters(): boolean {
  for (const el of document.querySelectorAll<HTMLElement>('[data-spm-widget], [data-spm-template]')) {
    for (const attr of el.attributes) {
      if (NAMED_LIST_ATTR.test(attr.name) && attr.value.trim() && !/^[\d,\s]+$/.test(attr.value)) return true;
    }
  }
  return false;
}

// The page's first search as far as it can be known before the lists load —
// the same steps init() takes below. Null when it can't be known yet (named
// filters, or a curated block whose filters init() may set aside); the first
// search then simply starts after the lists, as it always did.
function guessFirstSearch(config: WidgetConfig): SearchFilters | null {
  if (pageHasNamedListFilters()) return null;
  if ([...document.querySelectorAll<HTMLElement>('[data-spm-widget]')].some((el) => isCurated(el))) return null;
  const fromUrl = filtersFromQuery();
  const merged: SearchFilters = { ...parsePrefilledFilters(), ...fromUrl };
  const effective: SearchFilters = { ...merged, page: 1, limit: merged.limit || config.resultsPerPage || 12 };
  for (const [key, value] of Object.entries(parseLockedFilters())) {
    if (value != null) (effective as Record<string, unknown>)[key] = value;
  }
  return effective;
}

function startBoot(config: WidgetConfig): Boot {
  // The loader's CDN fallback reads the config from the store (as it did when
  // init() set it before loading).
  actions.setConfig(config);
  const loader = new DataLoader(config);
  const b = {} as Boot;
  b.config = config;
  b.loader = loader;
  b.live = null;
  // Drawn from a saved copy of the dashboard settings; these are the live ones.
  loader.onLiveConfig = (live) => {
    b.live = live;
    // A boot init() replaced (see bootStillValid) must not touch the page.
    if (initStarted && boot === b) applyLiveConfig(config, live);
  };
  b.bundle = loader.loadBundle();
  b.bundle.catch(() => {}); // init() reports it
  // Start what the page will need at the same time as the lists and settings,
  // instead of after them: the property on a detail page, the first search
  // everywhere else. Used in init() when the filters come out the same.
  // A script in <head> runs before the blocks exist: nothing to guess from
  // then, so the first search waits for init() instead of being a wasted one.
  const entries = scanDOM();
  b.earlyDetail = entries.some((e) => e.isTemplate && e.templateId?.startsWith('detail-template'));
  b.earlyRefs = b.earlyDetail ? detailRefCandidates(config) : [];
  b.earlyProperty = b.earlyRefs[0] ? loader.getProperty(b.earlyRefs[0]).catch(() => null) : null;
  const guess = b.earlyDetail || !entries.length ? null : guessFirstSearch(config);
  b.earlyKey = guess ? loader.searchKeyFor(guess) : '';
  b.earlySearch = guess ? loader.searchProperties(guess).catch(() => null) : null;
  return b;
}

function applyLiveConfig(config: WidgetConfig, live: Partial<WidgetConfig>): void {
  const merged = mergeWithDashboardConfig(config, live);
  actions.setConfig(merged);
  applyTheme(merged);
  actions.setCurrencyBase(merged.currency || 'EUR');
  // Blocks already drawn from a saved copy follow a newer design choice.
  remountChangedSiteBlocks().catch((err) => console.error('[SPM] Redraw failed:', err));
}

// Tells the WordPress plugin (2.9+) which search this page opens with, when it
// hasn't saved that one yet. Once per browser session per page and search;
// never anything about the visitor.
function reportPageSearch(config: WidgetConfig, key: string): void {
  const report = config.reportSearch;
  if (!report || !key || key === config.pageResults?.key) return;
  const flag = `spm-reported:${report.page}:${key}`;
  try {
    if (sessionStorage.getItem(flag)) return;
    sessionStorage.setItem(flag, '1');
  } catch {
    // Storage blocked: still fine to send.
  }
  fetch(report.url, {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: report.page, lang: config.language || 'en', key }),
  }).catch(() => {});
}

// The boot was made with the config the page had when the script ran; a block
// that arrived later may say otherwise (its own key, language or data file).
function bootStillValid(b: Boot, config: WidgetConfig): boolean {
  return (['apiUrl', 'apiKey', 'language', 'dataBundleUrl', 'dataPath'] as const)
    .every((k) => b.config[k] === config[k]);
}

// The property reference(s) a detail page's address may carry: `?ref=` on
// propertyPageUrl links; on pretty links, the path segment after the detail
// slug (which may be language-prefixed, e.g. "de/property", so match on its
// last part).
function detailRefCandidates(config: WidgetConfig): string[] {
  const queryRef = new URLSearchParams(window.location.search).get('ref');
  if (queryRef) return [queryRef];
  const slug = (config.propertyPageSlug || 'property').split('/').filter(Boolean).pop() || 'property';
  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  const slugIdx = pathSegments.indexOf(slug);
  const segment = slugIdx >= 0 ? pathSegments[slugIdx + 1] : pathSegments[pathSegments.length - 1];
  return segment ? extractRefCandidates(decodeURIComponent(segment), refFirst(config) ? 'start' : config.propertyRefPosition) : [];
}

// What the current page shows; set by setupPage(), read by the search handler
// and the sync poll. A single-page app (Next.js, React Router) replaces it on
// every route change through RealtySoft.refresh().
interface PageState {
  hasDetailTemplate: boolean;
  hasResultsView: boolean;
  initialFilters: () => SearchFilters;
}
let page: PageState | null = null;
let pageConfig: WidgetConfig | null = null;
let bundleReady = false;
let seoHooked = false;
let pageRun = 0;

async function init(): Promise<void> {
  console.log('[SPM] init() starting...');
  initStarted = true;
  const config = parseConfig();

  if (!config.apiUrl || !config.apiKey) {
    console.warn('[SPM] Missing apiUrl or apiKey — widget will not initialize.');
    return;
  }

  actions.setConfig(config);

  registerAllComponents();

  const entries = scanDOM();
  console.log('[SPM] Scan found', entries.length, 'elements:', entries.map(e => e.isTemplate ? e.templateId : e.componentType));
  for (const entry of entries) {
    if (!entry.element.children.length) {
      entry.element.innerHTML = '<div class="rs-skeleton" style="height:42px"></div>';
    }
  }

  // First paint in the brand colour the page already knows; the dashboard's
  // colour replaces it once the config arrives.
  const brandColor = window.RealtySoftConfig?.brandColor;
  applyTheme(config.primaryColor || !brandColor || !/^#[0-9a-f]{6}$/i.test(brandColor) ? config : { ...config, primaryColor: brandColor });
  // Page-set currency now; refined once the dashboard config arrives.
  actions.setCurrencyBase(config.currency || 'EUR');

  const favorites = loadPersistedFavorites();
  if (favorites.length) actions.setFavorites(favorites);

  // Started when the script ran (see startBoot) — or now, when the page was
  // already loaded or a later block changed the config.
  const b = boot && bootStillValid(boot, config) ? boot : startBoot(config);
  boot = b;
  dataLoader = b.loader;
  pageConfig = config;

  try {
    console.log('[SPM] Loading bundle...');
    const bundle = await b.bundle;
    console.log('[SPM] Bundle loaded:', {
      syncVersion: bundle.syncVersion,
      locations: bundle.locations?.length,
      types: bundle.types?.length,
      features: bundle.features?.length,
      labels: Object.keys(bundle.labels || {}).length,
      hasResults: !!bundle.defaultResults,
      resultCount: bundle.defaultResults?.data?.length,
    });
    if (bundle.config) {
      const merged = mergeWithDashboardConfig(config, bundle.config);
      actions.setConfig(merged);
      applyTheme(merged);
      actions.setCurrencyBase(merged.currency || 'EUR');
    }
    // Live settings that arrived before this point are newer than the copy
    // the bundle carried.
    if (b.live) applyLiveConfig(config, b.live);
    dataLoader.hydrateStore(bundle);
    bundleReady = true;
  } catch (err) {
    console.error('[SPM] Bundle load failed:', err);
    actions.setError(err instanceof Error ? err.message : 'Failed to load widget data');
  }

  installLegacyAPI();
  setSearchHandler(runSearch);
  setRefreshHandler(refresh);

  await setupPage(config, b);

  dataLoader.loadExchangeRates(store.getState().currency.base || 'EUR');

  // Something changed in the dashboard while the page was open. The lists
  // and labels are already in the store (the blocks follow them); a new
  // design redraws just that block; the results are fetched again and replace
  // the cards only if they differ. Until 10-05 every block was torn down and
  // drawn again, so a visitor reading the listings saw them blank and reload
  // (and the design flash from 01 to the chosen one).
  dataLoader.startSyncPolling(config.syncPollIntervalMs || 60_000, (fresh) => {
    if (fresh.config) applyLiveConfig(config, fresh.config);
    const shown = store.getState().results;
    if (!page || page.hasDetailTemplate || !shown || !dataLoader) return;
    const filters: SearchFilters = { ...page.initialFilters(), page: store.getState().filters.page || 1 };
    dataLoader.searchProperties(filters, { fresh: true })
      .then((results) => {
        if (store.getState().results === shown && JSON.stringify(results) !== JSON.stringify(shown)) actions.setResults(results);
      })
      .catch(() => {});
  });

  actions.setInitialized();
  actions.setLoading(false);

  // spm:ready is the name going forward; spw:ready stays for pages and
  // plugin versions that listen for it.
  document.dispatchEvent(new CustomEvent('spm:ready'));
  document.dispatchEvent(new CustomEvent('spw:ready'));

  const rc = window.RealtySoftConfig;
  if (rc?.onReady) rc.onReady();
}

// Names for the shareable URL ("marbella-12"), read fresh so they follow the
// page's language.
function nameLists(): NameLists {
  const s = store.getState();
  return { locations: s.locations, propertyTypes: s.propertyTypes, features: s.features };
}

async function runSearch(requested: SearchFilters, options?: SearchOptions): Promise<void> {
  if (!dataLoader) return;
  const config = store.getState().config;
  // Every page the same size as the first: without a limit the API pages by
  // 20, so page 2 started at listing 21 and a 17-result search had no page 2.
  const filters: SearchFilters = {
    ...requested,
    limit: requested.limit || config.resultsPerPage || pageConfig?.resultsPerPage || 12,
  };
  const hasResultsView = !!page?.hasResultsView;
  const resultsPage = config.resultsPage;
  if (options?.navigate && !hasResultsView && resultsPage) {
    const target = new URL(resultsPage, window.location.href);
    if (target.pathname !== window.location.pathname) {
      target.search = filtersToQuery(filters, nameLists());
      navigateTo(target.toString());
      return;
    }
  }
  actions.setSearchLoading(true);
  try {
    const results = await dataLoader.searchProperties(filters);
    actions.setResults(results);
    trackSearch(filters, results.meta?.total ?? results.data.length);
    // The results on screen are now shareable: the URL says what they are.
    if (hasResultsView) writeSearchToUrl(filters, nameLists());
  } catch (err) {
    actions.setError(err instanceof Error ? err.message : 'Search failed');
  } finally {
    actions.setSearchLoading(false);
  }
}

/**
 * Everything that depends on the page itself: its filters (URL and block
 * attributes), its blocks, the property on a detail page and the first
 * search. Runs once at start, and again on every single-page-app route change
 * (refresh) — then only blocks not drawn yet are mounted.
 */
async function setupPage(config: WidgetConfig, b: Boot | null): Promise<void> {
  if (!dataLoader) return;
  const run = ++pageRun;
  const loader = dataLoader;
  // The guesses made while the script loaded only fit the first page.
  const first = run === 1 ? b : null;
  const earlyDetail = first ? first.earlyDetail : false;
  const earlyRefs = first ? first.earlyRefs : [];
  const earlyProperty = first ? first.earlyProperty : null;
  const earlyKey = first ? first.earlyKey : '';
  const earlySearch = first ? first.earlySearch : null;

  // A search sent from another page (see runSearch) arrives as query
  // parameters and overrides the page's own values; locked filters still win
  // when the search runs.
  const fromUrl = filtersFromQuery();
  if (Object.keys(fromUrl).length) actions.setFilters(fromUrl);

  // The page's first search, once its own and locked filters are known.
  const initialFilters = (): SearchFilters => {
    const stateFilters = store.getState().filters;
    const effective: SearchFilters = {
      ...stateFilters,
      page: 1,
      // A limit set on the page (data-spm-limit / limit="6") wins.
      limit: stateFilters.limit || config.resultsPerPage || 12,
    };
    for (const [key, value] of Object.entries(store.getState().lockedFilters)) {
      if (value != null) (effective as Record<string, unknown>)[key] = value;
    }
    return effective;
  };
  // Results drawn from a saved copy before the live answer (see below).
  let savedShown: SearchResults | null = null;

  if (bundleReady) {
    // A curated list on a page that has nowhere to show search results — the
    // "our featured six" block on a homepage — keeps its filters to itself.
    // Otherwise they became the page's filters, so pressing Search carried
    // "featured" along to the results page.
    markCuratedBlocksStandalone();
    liftSearchBlocks();

    // With locations, types and features in the store, the page's own filters
    // can be read (names resolve to ids against the client's lists).
    const prefilled = parsePrefilledFilters();
    const locked = parseLockedFilters();
    // Reset returns here, not to an empty form (see RESET_FILTERS).
    actions.setBaseFilters(prefilled);
    if (Object.keys(prefilled).length) actions.setFilters({ ...prefilled, ...store.getState().filters });
    if (Object.keys(locked).length) actions.setLockedFilters(locked);

    // The dashboard's default listing type, unless the page or the URL set one.
    const current = store.getState().filters;
    const defaultType = store.getState().config.defaultListingType || config.defaultListingType;
    if (defaultType && !current.listingType && !locked.listingType) {
      actions.setFilters({ ...current, listingType: defaultType });
    }
    // A saved answer to the first search (the plugin's file, or this
    // browser's last visit) is on screen the moment the blocks mount; the
    // live answer replaces it below.
    if (!earlyDetail && !store.getState().results) {
      savedShown = loader.peekSearch(initialFilters());
      if (savedShown) actions.setResults(savedShown);
    }
    console.log('[SPM] Store hydrated. Results:', !!store.getState().results);
  }

  // Blocks still on the page stay as they are (a search bar in a shared
  // layout); only new ones are drawn.
  const allEntries = scanDOM();
  const mountEntries = allEntries.filter((e) => !isMounted(e.element));
  console.log('[SPM] Mounting', mountEntries.length, 'components...');

  // Auto-load property from URL if a detail template is present
  const hasDetailTemplate = allEntries.some(
    (e) => e.isTemplate && e.templateId?.startsWith('detail-template')
  );
  // Page title / meta tags follow the property shown (however it was loaded).
  if (hasDetailTemplate && !seoHooked) {
    seoHooked = true;
    store.subscribeSlice('selectedProperty', (property) => {
      if (property) applyPropertySeo(property);
    });
  }
  if (hasDetailTemplate && !store.getState().selectedProperty) {
    const candidates = detailRefCandidates(config);
    for (const ref of candidates) {
      try {
        // The first candidate was asked for while the lists loaded.
        const early = ref === earlyRefs[0] && earlyProperty ? await earlyProperty : null;
        const property = early ?? await loader.getProperty(ref);
        if (run !== pageRun) return; // the visitor already moved on
        actions.setSelectedProperty(property);
        break;
      } catch (err) {
        console.warn(`[SPM] No property for ref "${ref}":`, err);
      }
    }
  }

  await mountAll(mountEntries);
  // Views, wishlist and card clicks for the client's Analytics.
  startTracking();
  // Live settings that arrived while the blocks were being drawn.
  await remountChangedSiteBlocks();
  console.log('[SPM] Mount complete');

  const hasResultsView = allEntries.some((e) => {
    const shows = e.isTemplate
      ? /^(listing|map)-template/.test(e.templateId || '')
      : RESULT_COMPONENTS.has(e.componentType);
    return shows && !isCurated(e.element);
  });
  page = { hasDetailTemplate, hasResultsView, initialFilters };

  // The first search — or, when a saved copy is already on screen, its live
  // refresh. Skipped on a detail page, which only needs its property, and on
  // a page without blocks.
  if ((savedShown || !store.getState().results) && !hasDetailTemplate && allEntries.length) {
    const effectiveFilters = initialFilters();
    const shown = store.getState().results;
    if (!savedShown) actions.setSearchLoading(true);
    try {
      // Usually already on its way (started with the lists).
      let results = loader.searchKeyFor(effectiveFilters) === earlyKey && earlySearch ? await earlySearch : null;
      if (!results) results = await loader.searchProperties(effectiveFilters, { fresh: !!savedShown });
      if (run !== pageRun) return;
      // A search the visitor ran meanwhile wins; an unchanged answer is left alone.
      if (store.getState().results === shown && JSON.stringify(results) !== JSON.stringify(shown)) {
        actions.setResults(results);
      }
      // A page opened on a search (?type=villa, a listing type page) counts as one.
      trackSearch(effectiveFilters, results.meta?.total ?? results.data.length, { skipEmpty: true });
    } catch (err) {
      if (!savedShown) actions.setError(err instanceof Error ? err.message : 'Initial search failed');
    } finally {
      actions.setSearchLoading(false);
    }
    // The page's own opening search (not one carried in from a shared link):
    // the plugin saves its results so the next visitor sees them at once.
    if (run === 1 && hasResultsView && !Object.keys(fromUrl).length) {
      reportPageSearch(config, loader.searchKeyFor(effectiveFilters));
    }
  }
}

/**
 * A single-page app changed route (Next.js, React Router, Vue Router…): drop
 * the blocks that left the page, forget the old page's search and property,
 * and set up the new page. The lists, settings, labels and wishlist stay.
 * Safe to call any time and as often as wanted; before the widget has started
 * it does nothing (the start sees the new page anyway).
 */
export async function refresh(): Promise<void> {
  if (!pageConfig || !dataLoader) return;
  releaseDetached();
  actions.setSelectedProperty(null);
  actions.setResults(null);
  actions.setError(null);
  actions.setLockedFilters({});
  actions.setBaseFilters({});
  actions.setFilters({});
  await setupPage(pageConfig, boot);
}

// The address this copy was loaded from (only readable while the script first runs).
const SELF_SRC = typeof document !== 'undefined' ? ((document.currentScript as HTMLScriptElement | null)?.src || '') : '';

function startWidget(): void {
  (window as Window & { __spmBuild?: string }).__spmBuild = __SPM_BUILD__;
  if (document.readyState === 'loading') {
    // The lists, settings and first search start now (when the page's config
    // is already known); the blocks mount at DOMContentLoaded as before.
    try {
      const early = parseConfig();
      if (early.apiUrl && early.apiKey) boot = startBoot(early);
    } catch (err) {
      console.warn('[SPM] early start skipped:', err);
      boot = null;
    }
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

/**
 * A copy loaded without ?ver= may be weeks old: /widget/*.js is cached in
 * browsers for 30 days. version.json is never cached, so ask it which build
 * is current; when it isn't this one, return the address to load instead.
 */
async function currentBuildUrl(): Promise<string | null> {
  try {
    const base = SELF_SRC.replace(/[?#].*$/, '').replace(/\/[^/]*$/, '');
    const res = await fetch(`${base}/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const current = (await res.json()) as { version?: string; build?: string };
    if (!current.build || !current.version || current.build === __SPM_BUILD__) return null;
    return `${base}/spm-widget.umd.js?ver=${encodeURIComponent(current.version)}`;
  } catch {
    return null; // offline / blocked: run this copy
  }
}

if (typeof document !== 'undefined') {
  const running = (window as Window & { __spmBuild?: string }).__spmBuild;
  if (running && window.RealtySoft?.refresh) {
    // Already running on this page: a site that adds the script again on
    // every route change (a single-page app). The running copy draws the new
    // page instead of a second widget starting next to it.
    void window.RealtySoft.refresh();
  } else if (!running && SELF_SRC && !/[?&]ver=/.test(SELF_SRC) && __SPM_BUILD__ !== 'dev') {
    void currentBuildUrl().then((url) => {
      if (!url) {
        startWidget();
        return;
      }
      console.warn('[SPM] Cached widget is out of date; loading the current one.');
      const fresh = document.createElement('script');
      fresh.src = url;
      fresh.onerror = () => startWidget();
      document.head.appendChild(fresh);
    });
  } else if (!running) {
    startWidget();
  }
}

export { store } from './core/store';
export { actions } from './core/actions';
export { selectors } from './core/selectors';
export { DataLoader } from './core/data-loader';
export type { WidgetConfig, SearchFilters, Property, SearchResults } from './types';
export type { Labels } from './types/labels';

export default { init, refresh };
