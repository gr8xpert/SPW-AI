import type { SearchFilters, SearchResults, Property, Location, PropertyType, Feature, WidgetConfig } from '@/types';
import type { Labels } from '@/types/labels';
import { ApiClient } from './api-client';
import { getCached, setCache, clearCache as clearIDB } from './idb-cache';
import { store } from './store';
import { actions } from './actions';

export interface BundleData {
  syncVersion: number;
  config?: Partial<WidgetConfig>;
  locations: Location[];
  types: PropertyType[];
  features: Feature[];
  labels: Record<string, string>;
  defaultResults?: SearchResults;
}

interface SyncMeta {
  syncVersion: number;
  tenantSlug: string;
}

declare global {
  interface Window {
    __SPM_DATA__?: BundleData;
  }
}

let activeLoader: DataLoader | null = null;

export function getDataLoader(): DataLoader | null {
  return activeLoader;
}

export class DataLoader {
  private api: ApiClient;
  private apiKey: string;
  private cdnUrl: string;
  private dataPath: string;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private visibilityHandler: (() => void) | null = null;
  private memoryCache = new Map<string, { data: unknown; ts: number }>();
  private readonly MEMORY_TTL = 5 * 60 * 1000;
  private localDataAvailable: boolean | null = null;
  private config: WidgetConfig;

  constructor(config: WidgetConfig) {
    this.config = config;
    this.api = new ApiClient({ apiUrl: config.apiUrl, apiKey: config.apiKey });
    this.apiKey = config.apiKey;
    this.cdnUrl = config.cdnUrl || 'https://data.smartpropertywidget.com';
    this.dataPath = config.dataPath || '/spm-data';
    activeLoader = this;
  }

  async loadBundle(): Promise<BundleData> {
    // Layer 0: WP inline preload
    const inline = this.tryInlineData();
    if (inline) {
      this.persistToIDB(inline);
      return inline;
    }

    // Layer 0b: the WordPress plugin's per-language bundle file
    const pluginBundle = await this.tryPluginBundle();
    if (pluginBundle) return pluginBundle;

    // Layer 1: IndexedDB cache
    const cached = await this.tryIDBCache();
    if (cached) {
      this.checkFreshnessInBackground();
      return cached;
    }

    // Layer 2: CDN bundle
    const cdn = await this.tryCDNBundle();
    if (cdn) {
      this.persistToIDB(cdn);
      return cdn;
    }

    // Layer 3: API fallback (individual endpoints)
    return this.loadFromAPI();
  }

  // One request for all four lookup lists, served (and browser/CDN cached)
  // from the WordPress site. Dashboard settings still come live from the API
  // in parallel — they change independently of the lookup data. A bundle for a
  // different language, or one that fails to load, falls back to the normal
  // layers. A stale bundle is corrected by the regular sync-version polling.
  private async tryPluginBundle(): Promise<BundleData | null> {
    const url = this.config.dataBundleUrl;
    if (!url) return null;
    try {
      const [res, dashboardConfig] = await Promise.all([
        // A file that never arrives falls back to the other layers instead of
        // leaving the page empty.
        fetch(url, typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? { signal: AbortSignal.timeout(10_000) } : undefined),
        this.api.get<Partial<WidgetConfig>>('/v1/widget-config').catch(() => null),
      ]);
      if (!res.ok) return null;
      const json = await res.json() as {
        lang?: string;
        syncVersion?: number;
        locations?: Location[];
        types?: PropertyType[];
        features?: Feature[];
        labels?: Record<string, string>;
      };
      if (json.lang && json.lang !== (this.config.language || 'en')) return null;
      if (!Array.isArray(json.locations) || !Array.isArray(json.types)) return null;
      return {
        syncVersion: json.syncVersion ?? 0,
        config: dashboardConfig ?? undefined,
        locations: json.locations,
        types: json.types,
        features: json.features ?? [],
        labels: json.labels ?? {},
      };
    } catch {
      return null;
    }
  }

  private tryInlineData(): BundleData | null {
    const data = window.__SPM_DATA__;
    if (!data) return null;
    return data;
  }

  private async tryIDBCache(): Promise<BundleData | null> {
    const entry = await getCached<BundleData>(this.cacheKey());
    if (!entry) return null;
    return entry.data;
  }

  private async tryCDNBundle(): Promise<BundleData | null> {
    const config = store.getState().config;
    const slug = config.tenantSlug;
    const version = config.syncVersion;
    if (!slug) return null;

    const url = version
      ? `${this.cdnUrl}/${slug}/v${version}/bundle.json`
      : `${this.cdnUrl}/${slug}/bundle.json`;

    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  private async loadFromAPI(): Promise<BundleData> {
    const [locations, types, features, labels, dashboardConfig] = await Promise.all([
      this.loadLocalFileOrAPI<Location[]>('locations.json', '/v1/locations'),
      this.loadLocalFileOrAPI<PropertyType[]>('types.json', '/v1/property-types'),
      this.loadLocalFileOrAPI<Feature[]>('features.json', '/v1/features'),
      this.loadLocalFileOrAPI<Record<string, string>>('labels.json', '/v1/labels'),
      this.api.get<Partial<WidgetConfig>>('/v1/widget-config').catch(() => null),
    ]);

    const syncMeta = await this.fetchSyncMeta();

    const bundle: BundleData = {
      syncVersion: syncMeta?.syncVersion ?? 0,
      config: dashboardConfig ?? undefined,
      locations: locations ?? [],
      types: types ?? [],
      features: features ?? [],
      labels: labels ?? {},
    };

    this.persistToIDB(bundle);
    return bundle;
  }

  private async loadLocalFileOrAPI<T>(filename: string, apiEndpoint: string): Promise<T | null> {
    // Skip local probe entirely if a prior probe already 404'd — keeps the
    // browser console clean on WP installs that don't pre-render /spm-data/*.json.
    if (this.localDataAvailable !== false) {
      try {
        const res = await fetch(`${this.dataPath}/${filename}`);
        if (res.ok) {
          this.localDataAvailable = true;
          return await res.json();
        }
        if (res.status === 404) this.localDataAvailable = false;
      } catch { /* local file not available */ }
    }

    try {
      return await this.api.get<T>(apiEndpoint);
    } catch {
      return null;
    }
  }

  private async persistToIDB(data: BundleData): Promise<void> {
    await setCache(this.cacheKey(), data, data.syncVersion);
  }

  private cacheKey(): string {
    return `spm:${this.apiKey.slice(-8)}`;
  }

  async checkFreshnessInBackground(): Promise<void> {
    try {
      const meta = await this.fetchSyncMeta();
      if (!meta) return;

      const current = store.getState().syncVersion;
      if (meta.syncVersion > current) {
        await clearIDB(this.cacheKey());
        const fresh = await this.tryCDNBundle() ?? await this.loadFromAPI();
        this.hydrateStore(fresh);
        actions.setSyncVersion(meta.syncVersion);
      }
    } catch { /* background check failed */ }
  }

  async fetchSyncMeta(): Promise<SyncMeta | null> {
    try {
      return await this.api.get<SyncMeta>('/v1/sync-meta');
    } catch {
      return null;
    }
  }

  hydrateStore(bundle: BundleData): void {
    actions.setLocations(bundle.locations);
    actions.setPropertyTypes(bundle.types);
    actions.setFeatures(bundle.features);
    actions.setLabels(bundle.labels as unknown as Labels);
    actions.setSyncVersion(bundle.syncVersion);
    if (bundle.defaultResults) {
      actions.setResults(bundle.defaultResults);
    }
  }

  async searchProperties(filters: SearchFilters): Promise<SearchResults> {
    const cacheKey = `search:${JSON.stringify(filters)}`;
    const cached = this.getMemoryCache<SearchResults>(cacheKey);
    if (cached) return cached;

    const results = await this.api.get<SearchResults>('/v1/properties', searchParams(filters));
    this.setMemoryCache(cacheKey, results);
    return results;
  }

  // "Describe your dream property": the sentence goes to the API, which asks
  // the client's own OpenRouter account to turn it into filters. Never cached
  // — each sentence is different, and the answer costs the client money.
  async aiSearch(query: string, language: string): Promise<{ filters: Record<string, unknown>; interpretation?: string }> {
    return this.api.post('/v1/ai-search', { query, language });
  }

  async aiSearchEnabled(): Promise<boolean> {
    try {
      const res = await this.api.get<{ enabled?: boolean; data?: { enabled?: boolean } }>('/v1/ai-search/status');
      return !!(res?.enabled ?? res?.data?.enabled);
    } catch {
      return false;
    }
  }

  // Every listing matching the filters as a light map point (not one page),
  // with a position from its own GPS or, marked approximate, its location.
  // The area box and paging are the list's business, not the map's.
  async getMapPoints(filters: SearchFilters): Promise<MapPointsResponse> {
    const { page, limit, sortBy, bounds, ...rest } = filters;
    void page; void limit; void sortBy; void bounds;
    const cacheKey = `map:${JSON.stringify(rest)}`;
    const cached = this.getMemoryCache<MapPointsResponse>(cacheKey);
    if (cached) return cached;
    const res = await this.api.get<MapPointsResponse>('/v1/properties/map', searchParams(rest));
    this.setMemoryCache(cacheKey, res);
    return res;
  }

  // The places the current search covers, each with how many listings are in
  // it and the outline of the place itself. Feed listings arrive with no
  // coordinates, so this is what a map can honestly show: the town, drawn,
  // with a count on it — rather than a pin per listing in the middle of it.
  async getAreas(filters: SearchFilters): Promise<MapAreasResponse> {
    const { page, limit, sortBy, bounds, ...rest } = filters;
    void page; void limit; void sortBy; void bounds;
    const cacheKey = `areas:${JSON.stringify(rest)}`;
    const cached = this.getMemoryCache<MapAreasResponse>(cacheKey);
    if (cached) return cached;
    // The API client unwraps a plain `{ data }` envelope (only `{ data, meta }`
    // survives whole), so this arrives as the array itself.
    const res = await this.api.get<MapArea[] | MapAreasResponse>('/v1/properties/areas', searchParams(rest));
    const areas: MapAreasResponse = { data: Array.isArray(res) ? res : (res?.data ?? []) };
    this.setMemoryCache(cacheKey, areas);
    return areas;
  }

  // One place's point and outline, for the detail page map. The outline was
  // geocoded with its parents for context and checked against them, which is
  // why the page no longer asks OpenStreetMap for a bare town name from the
  // browser and no longer draws the wrong "Los Alamos".
  async getLocationOutline(locationId: number): Promise<LocationOutline | null> {
    const cacheKey = `outline:${locationId}`;
    const cached = this.getMemoryCache<LocationOutline | null>(cacheKey);
    if (cached !== null && cached !== undefined) return cached;
    try {
      const res = await this.api.get<LocationOutline | { data?: LocationOutline }>(`/v1/locations/${locationId}/outline`);
      const outline = (res && 'lat' in res ? res : (res as { data?: LocationOutline })?.data) || null;
      this.setMemoryCache(cacheKey, outline);
      return outline;
    } catch {
      return null;
    }
  }

  async loadExchangeRates(baseCurrency = 'EUR'): Promise<void> {
    const cacheKey = `rates:${baseCurrency}`;
    const cached = this.getMemoryCache<Record<string, number>>(cacheKey);
    if (cached) {
      actions.setCurrencyRates(cached);
      return;
    }
    try {
      const res = await fetch(
        `https://api.frankfurter.dev/v1/latest?from=${baseCurrency}`,
      );
      if (!res.ok) return;
      const data = await res.json() as { rates: Record<string, number> };
      const rates = { [baseCurrency]: 1, ...data.rates };
      actions.setCurrencyRates(rates);
      this.setMemoryCache(cacheKey, rates);
    } catch { /* exchange rates unavailable — prices show unconverted */ }
  }

  // Loads specific properties by id, in batches the API accepts. Used by the
  // wishlist, whose saved ids are not tied to any page of search results.
  async getPropertiesByIds(ids: number[]): Promise<Property[]> {
    const unique = [...new Set(ids)].filter((id) => Number.isFinite(id));
    const out: Property[] = [];
    for (let i = 0; i < unique.length; i += 100) {
      const chunk = unique.slice(i, i + 100);
      const res = await this.api.get<SearchResults>('/v1/properties', {
        ids: chunk.join(','),
        limit: chunk.length,
      });
      out.push(...(res?.data ?? []));
    }
    return out;
  }

  async getProperty(reference: string): Promise<Property> {
    const cacheKey = `property:${reference}`;
    const cached = this.getMemoryCache<Property>(cacheKey);
    if (cached) return cached;

    const property = await this.api.get<Property>(`/v1/properties/${encodeURIComponent(reference)}`);
    // Mark this payload as the full detail — search results (thin, 5 images
    // max) leave this flag off. DetailTemplate uses it to detect stale/thin
    // selectedProperty and re-fetch.
    property.__detailFull = true;
    this.setMemoryCache(cacheKey, property);
    return property;
  }

  async getSimilarProperties(reference: string, limit = 6): Promise<Property[]> {
    return this.api.get<Property[]>(`/v1/properties/${encodeURIComponent(reference)}/similar`, { limit });
  }

  async submitInquiry(data: unknown): Promise<{ success: boolean; message: string }> {
    return this.api.post('/v1/inquiry', data);
  }

  async shareFavorites(data: unknown): Promise<{ success: boolean; message: string }> {
    return this.api.post('/v1/share-favorites', data);
  }

  async trackEvent(event: unknown): Promise<void> {
    try {
      await this.api.post('/v1/track', event);
    } catch { /* fire and forget */ }
  }

  startSyncPolling(intervalMs = 60_000, onChange?: () => void): void {
    this.stopSyncPolling();

    const tick = async () => {
      if (document.hidden) return;
      try {
        const meta = await this.fetchSyncMeta();
        if (!meta) return;
        const current = store.getState().syncVersion;
        if (meta.syncVersion > current) {
          await clearIDB(this.cacheKey());
          this.memoryCache.clear();
          const fresh = await this.tryCDNBundle() ?? await this.loadFromAPI();
          this.hydrateStore(fresh);
          onChange?.();
        }
      } catch { /* poll failed */ }
    };

    this.syncTimer = setInterval(tick, intervalMs);

    this.visibilityHandler = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  stopSyncPolling(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  clearAllCaches(): void {
    this.memoryCache.clear();
    clearIDB(this.cacheKey());
  }

  private getMemoryCache<T>(key: string): T | null {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > this.MEMORY_TTL) {
      this.memoryCache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setMemoryCache<T>(key: string, data: T): void {
    this.memoryCache.set(key, { data, ts: Date.now() });
  }
}

export interface MapPoint {
  id: number;
  reference: string;
  title: string;
  price: number | null;
  currency: string;
  priceOnRequest: boolean;
  listingType: string;
  bedrooms: number | null;
  bathrooms: number | null;
  buildSize: number | null;
  lat: number;
  lng: number;
  approximate: boolean;
  location: { id: number; name: string } | null;
  propertyType?: { name: string } | null;
  slug?: string | null;
  urlSegment?: string;
  image: string | null;
}

// A GeoJSON outline as the API stores it: longitude first, as GeoJSON has it.
export interface AreaBoundary {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

export interface MapArea {
  id: number;
  name: string;
  level: string;
  count: number;
  lat: number;
  lng: number;
  // Missing when we are not sure enough of where the place is to draw its
  // shape — its point is an ancestor's.
  boundary: AreaBoundary | null;
  // Where this place's listings may be drawn: its own outline, or the nearest
  // ancestor's. Most places are a point in OpenStreetMap, not an area, and
  // their municipality's boundary follows the coastline — which is what keeps
  // a listing from being spread into the sea.
  fence: AreaBoundary | null;
}

export interface MapAreasResponse {
  data: MapArea[];
}

export interface LocationOutline {
  id: number;
  name: string;
  level: string;
  lat: number;
  lng: number;
  // True when this is an ancestor's point, not the place's own.
  approximate: boolean;
  boundary: AreaBoundary | null;
  // The nearest outline worth drawing: this place's, or its municipality's.
  fence: AreaBoundary | null;
}

export interface MapPointsResponse {
  data: MapPoint[];
  meta: { total: number; truncated: boolean };
}

// Query string for /v1/properties (and /map, which takes the same filters).
function searchParams(filters: SearchFilters): Record<string, string | number | boolean | undefined> {
  const params: Record<string, string | number | boolean | undefined> = {};
  if (filters.query) params.query = filters.query;
  if (filters.listingType) params.listingType = filters.listingType;
  if (filters.locationId) params.locationId = filters.locationId;
  if (filters.locationIds?.length) params.locationIds = filters.locationIds.join(',');
  if (filters.propertyTypeId) params.propertyTypeId = filters.propertyTypeId;
  if (filters.minPrice) params.minPrice = filters.minPrice;
  if (filters.maxPrice) params.maxPrice = filters.maxPrice;
  if (filters.minBedrooms) params.minBedrooms = filters.minBedrooms;
  if (filters.maxBedrooms) params.maxBedrooms = filters.maxBedrooms;
  if (filters.minBathrooms) params.minBathrooms = filters.minBathrooms;
  if (filters.maxBathrooms) params.maxBathrooms = filters.maxBathrooms;
  if (filters.minBuildSize) params.minBuildSize = filters.minBuildSize;
  if (filters.maxBuildSize) params.maxBuildSize = filters.maxBuildSize;
  if (filters.minPlotSize) params.minPlotSize = filters.minPlotSize;
  if (filters.maxPlotSize) params.maxPlotSize = filters.maxPlotSize;
  if (filters.minTerraceSize) params.minTerraceSize = filters.minTerraceSize;
  if (filters.maxTerraceSize) params.maxTerraceSize = filters.maxTerraceSize;
  if (filters.reference) params.reference = filters.reference;
  if (filters.isFeatured) params.isFeatured = true;
  if (filters.isOwnProperty) params.isOwnProperty = true;
  if (filters.sortBy) params.sortBy = filters.sortBy;
  if (filters.page) params.page = filters.page;
  if (filters.limit) params.limit = filters.limit;
  if (filters.bounds) params.bounds = filters.bounds;
  if (filters.lat != null) params.lat = filters.lat;
  if (filters.lng != null) params.lng = filters.lng;
  if (filters.radius) params.radius = filters.radius;
  if (filters.features?.length) params.features = filters.features.join(',');
  return params;
}
