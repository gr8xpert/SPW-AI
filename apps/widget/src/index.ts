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
import { installLegacyAPI, setSearchHandler } from './core/legacy-api';
import { loadPersistedFavorites } from './hooks/useFavorites';
import type { SearchFilters } from './types';

let dataLoader: DataLoader | null = null;

async function init(): Promise<void> {
  console.log('[SPW] init() starting...');
  const config = parseConfig();

  if (!config.apiUrl || !config.apiKey) {
    console.warn('[SPW] Missing apiUrl or apiKey — widget will not initialize.');
    return;
  }

  actions.setConfig(config);

  registerAllComponents();

  const entries = scanDOM();
  console.log('[SPW] Scan found', entries.length, 'elements:', entries.map(e => e.isTemplate ? e.templateId : e.componentType));
  for (const entry of entries) {
    if (!entry.element.children.length) {
      entry.element.innerHTML = '<div class="rs-skeleton" style="height:42px"></div>';
    }
  }

  applyTheme(config);

  const favorites = loadPersistedFavorites();
  if (favorites.length) actions.setFavorites(favorites);

  const prefilled = parsePrefilledFilters();
  const locked = parseLockedFilters();
  if (Object.keys(prefilled).length) actions.setFilters(prefilled);
  if (Object.keys(locked).length) actions.setLockedFilters(locked);

  dataLoader = new DataLoader(config);
  try {
    console.log('[SPW] Loading bundle...');
    const bundle = await dataLoader.loadBundle();
    console.log('[SPW] Bundle loaded:', {
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
    }
    dataLoader.hydrateStore(bundle);
    console.log('[SPW] Store hydrated. Results:', !!store.getState().results);
  } catch (err) {
    console.error('[SPW] Bundle load failed:', err);
    actions.setError(err instanceof Error ? err.message : 'Failed to load widget data');
  }

  const mountEntries = scanDOM();
  console.log('[SPW] Mounting', mountEntries.length, 'components...');
  await mountAll(mountEntries);
  console.log('[SPW] Mount complete');

  installLegacyAPI();

  setSearchHandler(async (filters: SearchFilters) => {
    if (!dataLoader) return;
    actions.setSearchLoading(true);
    try {
      const results = await dataLoader.searchProperties(filters);
      actions.setResults(results);
    } catch (err) {
      actions.setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      actions.setSearchLoading(false);
    }
  });

  // Initial search if bundle didn't include default results
  if (!store.getState().results) {
    const effectiveFilters: SearchFilters = {
      ...store.getState().filters,
      page: 1,
      limit: config.resultsPerPage || 12,
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

  dataLoader.startSyncPolling(config.syncPollIntervalMs || 60_000, () => {
    unmountAll();
    const freshEntries = scanDOM();
    mountAll(freshEntries);
  });

  actions.setInitialized();
  actions.setLoading(false);

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
