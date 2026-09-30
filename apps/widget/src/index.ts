import './styles/base.css';
import './styles/components.css';
import './styles/templates.css';
import './styles/animations.css';

import { store } from './core/store';
import { actions } from './core/actions';
import { DataLoader } from './core/data-loader';
import { scanDOM } from './core/dom-scanner';
import { mountAll, unmountAll } from './core/component-mounter';
import { registerAllComponents } from './registry/component-registry';
import { parseConfig, applyTheme, mergeWithDashboardConfig } from './core/config-parser';
import { parsePrefilledFilters, parseLockedFilters } from './core/attribute-parser';
import { isCurated, liftSearchBlocks, markCuratedBlocksStandalone, RESULT_COMPONENTS } from './core/block-role';
import { installLegacyAPI, setSearchHandler, type SearchOptions } from './core/legacy-api';
import { loadPersistedFavorites } from './hooks/useFavorites';
import { extractRefCandidates, refFirst } from './core/url-utils';
import { applyPropertySeo } from './core/seo';
import { filtersFromQuery, filtersToQuery, writeSearchToUrl, type NameLists } from './core/search-url';
import type { SearchFilters, SearchResults, WidgetConfig } from './types';

let dataLoader: DataLoader | null = null;

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

async function init(): Promise<void> {
  console.log('[SPM] init() starting...');
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

  // A search sent from another page (see the search handler below) arrives as
  // query parameters and overrides the page's own values; locked filters still
  // win when the search runs. The page's own filters are read after the lists
  // load (below), because a name like "Marbella" needs them to become an id.
  const fromUrl = filtersFromQuery();
  if (Object.keys(fromUrl).length) actions.setFilters(fromUrl);


  dataLoader = new DataLoader(config);
  // Drawn from a saved copy of the dashboard settings; these are the live ones.
  dataLoader.onLiveConfig = (live) => {
    const merged = mergeWithDashboardConfig(config, live);
    actions.setConfig(merged);
    applyTheme(merged);
    actions.setCurrencyBase(merged.currency || 'EUR');
  };

  // Start what the page will need at the same time as the lists and settings,
  // instead of after them: the property on a detail page, the first search
  // everywhere else. Used below when the filters come out the same.
  const earlyDetail = entries.some((e) => e.isTemplate && e.templateId?.startsWith('detail-template'));
  const earlyRefs = earlyDetail ? detailRefCandidates(config) : [];
  const earlyProperty = earlyRefs[0] ? dataLoader.getProperty(earlyRefs[0]).catch(() => null) : null;
  const earlyFilters: SearchFilters = {
    ...store.getState().filters,
    page: 1,
    limit: store.getState().filters.limit || config.resultsPerPage || 12,
  };
  const earlyKey = earlyDetail ? '' : dataLoader.searchKeyFor(earlyFilters);
  const earlySearch = earlyDetail ? null : dataLoader.searchProperties(earlyFilters).catch(() => null);

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

  try {
    console.log('[SPM] Loading bundle...');
    const bundle = await dataLoader.loadBundle();
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
    dataLoader.hydrateStore(bundle);

    // A curated list on a page that has nowhere to show search results — the
    // "our featured six" block on a homepage — keeps its filters to itself.
    // Otherwise they became the page's filters, so pressing Search carried
    // "featured" along to the results page and the visitor got someone else's
    // idea of what to look at.
    markCuratedBlocksStandalone();
    liftSearchBlocks();

    // Now that locations, types and features are in the store, the page's own
    // filters can be read (names resolve to ids against the client's lists).
    const prefilled = parsePrefilledFilters();
    const locked = parseLockedFilters();
    // Reset returns here, not to an empty form (see RESET_FILTERS).
    actions.setBaseFilters(prefilled);
    if (Object.keys(prefilled).length) actions.setFilters({ ...prefilled, ...store.getState().filters });
    if (Object.keys(locked).length) actions.setLockedFilters(locked);

    // The dashboard's default listing type, unless the page or the URL set one.
    const current = store.getState().filters;
    if (config.defaultListingType && !current.listingType && !locked.listingType) {
      actions.setFilters({ ...current, listingType: config.defaultListingType });
    }
    // A saved answer to the first search (the plugin's file, or this
    // browser's last visit) is on screen the moment the blocks mount; the
    // live answer replaces it below.
    if (!earlyDetail && !store.getState().results) {
      savedShown = dataLoader.peekSearch(initialFilters());
      if (savedShown) actions.setResults(savedShown);
    }
    console.log('[SPM] Store hydrated. Results:', !!store.getState().results);
  } catch (err) {
    console.error('[SPM] Bundle load failed:', err);
    actions.setError(err instanceof Error ? err.message : 'Failed to load widget data');
  }

  const mountEntries = scanDOM();
  console.log('[SPM] Mounting', mountEntries.length, 'components...');

  // Auto-load property from URL if a detail template is present
  const hasDetailTemplate = mountEntries.some(
    (e) => e.isTemplate && e.templateId?.startsWith('detail-template')
  );
  // Page title / meta tags follow the property shown (however it was loaded).
  if (hasDetailTemplate) {
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
        const property = early ?? await dataLoader.getProperty(ref);
        actions.setSelectedProperty(property);
        break;
      } catch (err) {
        console.warn(`[SPM] No property for ref "${ref}":`, err);
      }
    }
  }

  await mountAll(mountEntries);
  console.log('[SPM] Mount complete');

  installLegacyAPI();

  const hasResultsView = mountEntries.some((e) => {
    const shows = e.isTemplate
      ? /^(listing|map)-template/.test(e.templateId || '')
      : RESULT_COMPONENTS.has(e.componentType);
    return shows && !isCurated(e.element);
  });

  // Names for the shareable URL ("marbella-12"), read fresh so they follow the
  // page's language.
  const nameLists = (): NameLists => {
    const s = store.getState();
    return { locations: s.locations, propertyTypes: s.propertyTypes, features: s.features };
  };

  setSearchHandler(async (requested: SearchFilters, options?: SearchOptions) => {
    if (!dataLoader) return;
    // Every page the same size as the first: without a limit the API pages by
    // 20, so page 2 started at listing 21 and a 17-result search had no page 2.
    const filters: SearchFilters = {
      ...requested,
      limit: requested.limit || store.getState().config.resultsPerPage || config.resultsPerPage || 12,
    };
    const resultsPage = store.getState().config.resultsPage;
    if (options?.navigate && !hasResultsView && resultsPage) {
      const target = new URL(resultsPage, window.location.href);
      if (target.pathname !== window.location.pathname) {
        target.search = filtersToQuery(filters, nameLists());
        window.location.href = target.toString();
        return;
      }
    }
    actions.setSearchLoading(true);
    try {
      const results = await dataLoader.searchProperties(filters);
      actions.setResults(results);
      // The results on screen are now shareable: the URL says what they are.
      if (hasResultsView) writeSearchToUrl(filters, nameLists());
    } catch (err) {
      actions.setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      actions.setSearchLoading(false);
    }
  });

  // The first search — or, when a saved copy is already on screen, its live
  // refresh. Skipped on a detail page, which only needs its property.
  if ((savedShown || !store.getState().results) && !hasDetailTemplate) {
    const effectiveFilters = initialFilters();
    const shown = store.getState().results;
    if (!savedShown) actions.setSearchLoading(true);
    try {
      // Usually already on its way (started with the lists).
      let results = dataLoader.searchKeyFor(effectiveFilters) === earlyKey && earlySearch ? await earlySearch : null;
      if (!results) results = await dataLoader.searchProperties(effectiveFilters, { fresh: !!savedShown });
      // A search the visitor ran meanwhile wins; an unchanged answer is left alone.
      if (store.getState().results === shown && JSON.stringify(results) !== JSON.stringify(shown)) {
        actions.setResults(results);
      }
    } catch (err) {
      if (!savedShown) actions.setError(err instanceof Error ? err.message : 'Initial search failed');
    } finally {
      actions.setSearchLoading(false);
    }
  }

  dataLoader.loadExchangeRates(store.getState().currency.base || 'EUR');

  dataLoader.startSyncPolling(config.syncPollIntervalMs || 60_000, () => {
    unmountAll();
    const freshEntries = scanDOM();
    mountAll(freshEntries);
  });

  actions.setInitialized();
  actions.setLoading(false);

  document.dispatchEvent(new CustomEvent('spw:ready'));

  const rc = window.RealtySoftConfig;
  if (rc?.onReady) rc.onReady();
}

// Auto-initialize on DOMContentLoaded
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

export { store } from './core/store';
export { actions } from './core/actions';
export { selectors } from './core/selectors';
export { DataLoader } from './core/data-loader';
export type { WidgetConfig, SearchFilters, Property, SearchResults } from './types';
export type { Labels } from './types/labels';

export default { init };
