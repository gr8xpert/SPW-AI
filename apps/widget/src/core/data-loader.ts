import type {
  LocalData,
  Location,
  PropertyType,
  Feature,
  Labels,
  Property,
  SearchFilters,
  SearchResults,
  InquiryData,
  TrackingEvent,
} from '../types';

export interface DataLoaderConfig {
  apiUrl: string;
  apiKey: string;
  dataPath: string;
}

export interface SyncMeta {
  syncVersion: number;
  tenantSlug: string;
}

/**
 * DataLoader handles fetching data from both local JSON files and the API
 * - Local JSON: Used for dropdown data (locations, types, features, labels)
 * - API: Used for property search and property details
 */
export class DataLoader {
  private config: DataLoaderConfig;
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes

  // Sync polling state. `knownSyncVersion` is the version the widget's
  // current cache was built against. When a poll sees a newer number on
  // the server we know the operator clicked "clear cache" and we need to
  // drop our local maps + reload. Null until the first poll establishes
  // the baseline.
  private knownSyncVersion: number | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private visibilityHandler: (() => void) | null = null;
  private onSyncChange: ((newVersion: number) => void) | null = null;

  constructor(config: DataLoaderConfig) {
    this.config = config;
  }

  /**
   * Load all local data files at once
   */
  async loadLocalData(): Promise<LocalData> {
    const [locations, propertyTypes, features, labels, config] = await Promise.all([
      this.loadLocalFile<Location[]>('locations.json'),
      this.loadLocalFile<PropertyType[]>('types.json'),
      this.loadLocalFile<Feature[]>('features.json'),
      this.loadLocalFile<Labels>('labels.json'),
      this.loadLocalFile<LocalData['config']>('config.json'),
    ]);

    // Load sync metadata
    const syncMeta = await this.loadLocalFile<{ version: number; synced_at: string }>('sync_meta.json').catch(() => ({
      version: 0,
      synced_at: new Date().toISOString(),
    }));

    return {
      locations,
      propertyTypes,
      features,
      labels,
      config,
      syncVersion: syncMeta.version,
      lastSyncAt: syncMeta.synced_at,
    };
  }

  /**
   * Load a single local JSON file
   */
  async loadLocalFile<T>(filename: string): Promise<T> {
    const cacheKey = `local:${filename}`;
    const cached = this.getFromCache<T>(cacheKey);
    if (cached) return cached;

    const url = `${this.config.dataPath}/${filename}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load ${filename}: ${response.statusText}`);
      }
      const data = await response.json();
      this.setCache(cacheKey, data);
      return data;
    } catch (error) {
      console.error(`Error loading local file ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Search properties via API
   */
  async searchProperties(filters: SearchFilters): Promise<SearchResults> {
    const queryParams = new URLSearchParams();

    // Build query parameters
    if (filters.query) queryParams.append('q', filters.query);
    if (filters.listingType) queryParams.append('listingType', filters.listingType);
    if (filters.locationId) queryParams.append('locationId', String(filters.locationId));
    if (filters.propertyTypeId) queryParams.append('propertyTypeId', String(filters.propertyTypeId));
    if (filters.minPrice) queryParams.append('minPrice', String(filters.minPrice));
    if (filters.maxPrice) queryParams.append('maxPrice', String(filters.maxPrice));
    if (filters.minBedrooms) queryParams.append('minBedrooms', String(filters.minBedrooms));
    if (filters.maxBedrooms) queryParams.append('maxBedrooms', String(filters.maxBedrooms));
    if (filters.minBathrooms) queryParams.append('minBathrooms', String(filters.minBathrooms));
    if (filters.minBuildSize) queryParams.append('minBuildSize', String(filters.minBuildSize));
    if (filters.maxBuildSize) queryParams.append('maxBuildSize', String(filters.maxBuildSize));
    if (filters.features?.length) {
      filters.features.forEach(f => queryParams.append('features[]', String(f)));
    }
    if (filters.isFeatured !== undefined) queryParams.append('isFeatured', String(filters.isFeatured));
    if (filters.sortBy) queryParams.append('sortBy', filters.sortBy);
    if (filters.page) queryParams.append('page', String(filters.page));
    if (filters.limit) queryParams.append('limit', String(filters.limit));

    return this.apiRequest<SearchResults>(`/v1/properties?${queryParams.toString()}`);
  }

  /**
   * Get property by reference
   */
  async getProperty(reference: string): Promise<Property> {
    return this.apiRequest<Property>(`/v1/properties/${encodeURIComponent(reference)}`);
  }

  /**
   * Submit property inquiry
   */
  async submitInquiry(data: InquiryData): Promise<{ success: boolean; message: string }> {
    return this.apiRequest<{ success: boolean; message: string }>('/v1/inquiry', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Track event (view, search, etc.)
   */
  async trackEvent(event: TrackingEvent): Promise<void> {
    try {
      const endpoint = event.type === 'view' ? '/v1/track/view' : '/v1/track/search';
      await this.apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(event),
      });
    } catch (error) {
      // Silently fail tracking - don't break the widget
      console.warn('Tracking failed:', error);
    }
  }

  /**
   * Fetch the tenant's current sync metadata from the API. Widget polls
   * this to detect when an operator has clicked "clear cache" — the
   * syncVersion will have bumped and the local cache needs to drop.
   *
   * The server's global response interceptor wraps plain objects as
   * `{ data: ... }`; listing endpoints already return `{ data, meta }`
   * so they pass through unwrapped. Unwrap defensively here — handles
   * either shape so this keeps working if the API stops wrapping later.
   */
  async fetchSyncMeta(): Promise<SyncMeta> {
    const raw = await this.apiRequest<SyncMeta | { data: SyncMeta }>('/v1/sync-meta');
    return 'syncVersion' in raw ? raw : raw.data;
  }

  /**
   * Starts a background poll that drops the local cache whenever the
   * server's syncVersion advances past what we last saw. `intervalMs <= 0`
   * disables polling entirely.
   *
   * The callback fires AFTER the internal cache is cleared, so the widget
   * can re-run loadLocalData() / search() to repopulate.
   */
  startSyncPolling(intervalMs: number, onChange: (newVersion: number) => void): void {
    this.stopSyncPolling();
    if (intervalMs <= 0) return;

    this.onSyncChange = onChange;

    // Seed the baseline so the very first tick isn't treated as a change.
    void this.fetchSyncMeta()
      .then((meta) => {
        this.knownSyncVersion = meta.syncVersion;
      })
      .catch(() => {
        // Baseline unavailable — leave null; the first successful poll
        // sets it without firing onChange.
      });

    const tick = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const meta = await this.fetchSyncMeta();
        if (this.knownSyncVersion === null) {
          this.knownSyncVersion = meta.syncVersion;
          return;
        }
        if (meta.syncVersion > this.knownSyncVersion) {
          const newVersion = meta.syncVersion;
          this.knownSyncVersion = newVersion;
          this.clearCache();
          this.onSyncChange?.(newVersion);
        }
      } catch {
        // Transient failure — next tick will retry. Don't log noisily
        // on every failure; offline widgets shouldn't spam the console.
      }
    };

    this.pollTimer = setInterval(tick, intervalMs);

    // Re-run a tick immediately when the tab becomes visible again — if
    // the user clicked "clear cache" while the tab was in the background,
    // don't make them wait for the next full interval.
    if (typeof document !== 'undefined') {
      this.visibilityHandler = () => {
        if (!document.hidden) void tick();
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  stopSyncPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.onSyncChange = null;
  }

  /**
   * Make API request
   */
  private async apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.config.apiUrl}/api${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.config.apiKey,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `API request failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get from cache if not expired
   */
  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data as T;
    }
    return null;
  }

  /**
   * Set cache value
   */
  private setCache(key: string, data: unknown): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
