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
    __SPW_DATA__?: BundleData;
  }
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

  constructor(config: WidgetConfig) {
    this.api = new ApiClient({ apiUrl: config.apiUrl, apiKey: config.apiKey });
    this.apiKey = config.apiKey;
    this.cdnUrl = config.cdnUrl || 'https://data.smartpropertywidget.com';
    this.dataPath = config.dataPath || '/spw-data';
  }

  async loadBundle(): Promise<BundleData> {
    // Layer 0: WP inline preload
    const inline = this.tryInlineData();
    if (inline) {
      this.persistToIDB(inline);
      return inline;
    }

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

  private tryInlineData(): BundleData | null {
    const data = window.__SPW_DATA__;
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
    const [locations, types, features, labels] = await Promise.all([
      this.loadLocalFileOrAPI<Location[]>('locations.json', '/v1/locations'),
      this.loadLocalFileOrAPI<PropertyType[]>('types.json', '/v1/property-types'),
      this.loadLocalFileOrAPI<Feature[]>('features.json', '/v1/features'),
      this.loadLocalFileOrAPI<Record<string, string>>('labels.json', '/v1/labels'),
    ]);

    const syncMeta = await this.fetchSyncMeta();

    const bundle: BundleData = {
      syncVersion: syncMeta?.syncVersion ?? 0,
      locations: locations ?? [],
      types: types ?? [],
      features: features ?? [],
      labels: labels ?? {},
    };

    this.persistToIDB(bundle);
    return bundle;
  }

  private async loadLocalFileOrAPI<T>(filename: string, apiEndpoint: string): Promise<T | null> {
    try {
      const res = await fetch(`${this.dataPath}/${filename}`);
      if (res.ok) return await res.json();
    } catch { /* local file not available */ }

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
    return `spw:${this.apiKey.slice(-8)}`;
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

    const params: Record<string, string | number | boolean | undefined> = {};
    if (filters.query) params.query = filters.query;
    if (filters.listingType) params.listingType = filters.listingType;
    if (filters.locationId) params.locationId = filters.locationId;
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
    if (filters.reference) params.reference = filters.reference;
    if (filters.isFeatured) params.isFeatured = true;
    if (filters.sortBy) params.sortBy = filters.sortBy;
    if (filters.page) params.page = filters.page;
    if (filters.limit) params.limit = filters.limit;
    if (filters.bounds) params.bounds = filters.bounds;
    if (filters.lat != null) params.lat = filters.lat;
    if (filters.lng != null) params.lng = filters.lng;
    if (filters.radius) params.radius = filters.radius;
    if (filters.features?.length) params.features = filters.features.join(',');

    const results = await this.api.get<SearchResults>('/v1/properties', params);
    this.setMemoryCache(cacheKey, results);
    return results;
  }

  async getProperty(reference: string): Promise<Property> {
    const cacheKey = `property:${reference}`;
    const cached = this.getMemoryCache<Property>(cacheKey);
    if (cached) return cached;

    const property = await this.api.get<Property>(`/v1/properties/${encodeURIComponent(reference)}`);
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
