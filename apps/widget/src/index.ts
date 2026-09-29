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
import { isCurated, markCuratedBlocksStandalone, RESULT_COMPONENTS } from './core/block-role';
import { installLegacyAPI, setSearchHandler, type SearchOptions } from './core/legacy-api';
import { loadPersistedFavorites } from './hooks/useFavorites';
import { extractRefCandidates, refFirst } from './core/url-utils';
import { applyPropertySeo } from './core/seo';
import { filtersFromQuery, filtersToQuery, writeSearchToUrl, type NameLists } from './core/search-url';
import type { SearchFilters } from './types';

let dataLoader: DataLoader | null = null;

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
    // `propertyPageUrl` links carry the ref as ?ref=; pretty links carry it in
    // the path after the detail slug (which may be language-prefixed, e.g.
    // "de/property", so match on its last part).
    const queryRef = new URLSearchParams(window.location.search).get('ref');
    let candidates: string[] = [];
    if (queryRef) {
      candidates = [queryRef];
    } else {
      const slug = (config.propertyPageSlug || 'property').split('/').filter(Boolean).pop() || 'property';
      const pathSegments = window.location.pathname.split('/').filter(Boolean);
      const slugIdx = pathSegments.indexOf(slug);
      const segment = slugIdx >= 0 ? pathSegments[slugIdx + 1] : pathSegments[pathSegments.length - 1];
      candidates = segment ? extractRefCandidates(decodeURIComponent(segment), refFirst(config) ? 'start' : config.propertyRefPosition) : [];
    }
    for (const ref of candidates) {
      try {
        const property = await dataLoader.getProperty(ref);
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

  // Initial search if bundle didn't include default results.
  // Skip when a detail template is present — the page only needs single-property data.
  if (!store.getState().results && !hasDetailTemplate) {
    const stateFilters = store.getState().filters;
    const effectiveFilters: SearchFilters = {
      ...stateFilters,
      page: 1,
      // A limit set on the page (data-spm-limit / limit="6") wins.
      limit: stateFilters.limit || config.resultsPerPage || 12,
    };
    const locked = store.getState().lockedFilters;
    for (const [key, value] of Object.entries(locked)) {
      if (value != null) (effectiveFilters as Record<string, unknown>)[key] = value;
    }

    actions.setSearchLoading(true);
    try {
      const results = await dataLoader.searchProperties(effectiveFilters);
      actions.setResults(results);
    } catch (err) {
      actions.setError(err instanceof Error ? err.message : 'Initial search failed');
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
