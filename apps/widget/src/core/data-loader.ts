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

/**
 * DataLoader handles fetching data from both local JSON files and the API
 * - Local JSON: Used for dropdown data (locations, types, features, labels)
 * - API: Used for property search and property details
 */
export class DataLoader {
  private config: DataLoaderConfig;
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes

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
   * Check sync version with API
   */
  async checkSyncVersion(): Promise<{ version: number; lastUpdated: string }> {
    return this.apiRequest<{ version: number; lastUpdated: string }>('/v1/sync/version');
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
