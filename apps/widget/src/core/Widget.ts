import type {
  SPWConfig,
  LocalData,
  SearchFilters,
  SearchResults,
  Property,
  InquiryData,
  SPWEvents,
  Labels,
} from '../types';
import { DataLoader } from './data-loader';
import { defaultLabels } from './default-labels';
import { SearchForm } from '../components/SearchForm';
import { ResultsGrid } from '../components/ResultsGrid';
import { PropertyDetail } from '../components/PropertyDetail';
import { EventEmitter, deepMerge, generateSessionId, storage } from '../utils/helpers';
import '../styles/widget.css';

const DEFAULT_CONFIG: Partial<SPWConfig> = {
  dataPath: '/spw-data',
  language: 'en',
  currency: 'EUR',
  theme: 'light',
  layout: 'grid',
  resultsPerPage: 12,
  showFilters: true,
  showSorting: true,
  showPagination: true,
  enableFavorites: true,
  enableInquiry: true,
  enableTracking: true,
  // Poll the API's /v1/sync-meta once a minute so "clear cache" clicks
  // from the tenant dashboard propagate within ~60s even without a
  // webhook-based notification channel.
  syncPollIntervalMs: 60_000,
};

export class SPWWidget extends EventEmitter<SPWEvents> {
  private config: SPWConfig;
  private container: HTMLElement;
  private dataLoader: DataLoader;
  private localData: LocalData | null = null;
  private labels: Labels = defaultLabels;

  private searchForm: SearchForm | null = null;
  private resultsGrid: ResultsGrid | null = null;
  private propertyDetail: PropertyDetail | null = null;

  private currentFilters: SearchFilters = {};
  private favorites: Set<number> = new Set();
  private sessionId: string;
  private isInitialized = false;

  constructor(config: SPWConfig) {
    super();

    // Merge config with defaults
    this.config = deepMerge(DEFAULT_CONFIG, config) as SPWConfig;

    // Get container element
    if (typeof this.config.container === 'string') {
      const el = document.querySelector(this.config.container);
      if (!el) {
        throw new Error(`SPW Widget: Container "${this.config.container}" not found`);
      }
      this.container = el as HTMLElement;
    } else {
      this.container = this.config.container;
    }

    // Initialize data loader
    this.dataLoader = new DataLoader({
      apiUrl: this.config.apiUrl,
      apiKey: this.config.apiKey,
      dataPath: this.config.dataPath || '/spw-data',
    });

    // Get or create session ID
    this.sessionId = generateSessionId();

    // Load favorites from storage
    this.favorites = new Set(storage.get<number[]>('spw_favorites', []));
  }

  /**
   * Initialize the widget
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Add widget class to container
      this.container.classList.add('spw-widget');
      if (this.config.theme === 'dark') {
        this.container.classList.add('spw-theme-dark');
      }

      // Show loading state
      this.container.innerHTML = `
        <div class="spw-loading">
          <div class="spw-spinner"></div>
        </div>
      `;

      // Load local data (locations, types, features, labels)
      this.localData = await this.dataLoader.loadLocalData();

      // Merge labels
      this.labels = deepMerge(defaultLabels, this.localData.labels || {}) as Labels;
      if (this.config.customLabels) {
        this.labels = deepMerge(this.labels, this.config.customLabels) as Labels;
      }

      // Render widget structure
      this.render();

      // Perform initial search
      await this.search();

      // Start background sync poll — drops the local cache + reloads
      // whenever an operator bumps syncVersion from the dashboard.
      const interval = this.config.syncPollIntervalMs ?? 60_000;
      if (interval > 0) {
        this.dataLoader.startSyncPolling(interval, async (newVersion) => {
          try {
            this.localData = await this.dataLoader.loadLocalData();
            this.labels = deepMerge(defaultLabels, this.localData.labels || {}) as Labels;
            if (this.config.customLabels) {
              this.labels = deepMerge(this.labels, this.config.customLabels) as Labels;
            }
            await this.search();
            this.emit('sync:changed', { syncVersion: newVersion });
          } catch (err) {
            console.warn('SPW Widget: sync-change refresh failed', err);
          }
        });
      }

      this.isInitialized = true;
      this.emit('ready', undefined);
    } catch (error) {
      console.error('SPW Widget initialization failed:', error);
      this.container.innerHTML = `
        <div class="spw-no-results">
          <p>${this.labels['general.error']}</p>
        </div>
      `;
      this.emit('error', error as Error);
    }
  }

  /**
   * Render widget structure
   */
  private render(): void {
    this.container.innerHTML = `
      <div class="spw-container">
        ${this.config.showFilters ? '<div id="spw-search-form"></div>' : ''}
        <div id="spw-results"></div>
      </div>
    `;

    // Initialize search form
    if (this.config.showFilters && this.localData) {
      const formContainer = this.container.querySelector('#spw-search-form') as HTMLElement;
      this.searchForm = new SearchForm({
        container: formContainer,
        locations: this.localData.locations,
        propertyTypes: this.localData.propertyTypes,
        labels: this.labels,
        priceRanges: this.localData.config?.priceRanges,
        bedroomOptions: this.localData.config?.bedroomOptions,
        onSubmit: (filters) => this.handleSearch(filters),
        onReset: () => this.handleReset(),
      });
    }

    // Initialize results grid
    const resultsContainer = this.container.querySelector('#spw-results') as HTMLElement;
    this.resultsGrid = new ResultsGrid({
      container: resultsContainer,
      labels: this.labels,
      currency: this.config.currency,
      layout: this.config.layout,
      enableFavorites: this.config.enableFavorites,
      favorites: this.favorites,
      showSorting: this.config.showSorting,
      showPagination: this.config.showPagination,
      onPropertyClick: (property) => this.handlePropertyClick(property),
      onFavoriteToggle: (property) => this.handleFavoriteToggle(property),
      onSortChange: (sortBy) => this.handleSortChange(sortBy),
      onPageChange: (page) => this.handlePageChange(page),
    });
  }

  /**
   * Perform search
   */
  public async search(filters?: SearchFilters): Promise<void> {
    if (filters) {
      this.currentFilters = { ...filters };
    }

    // Add pagination defaults
    const searchFilters: SearchFilters = {
      ...this.currentFilters,
      page: this.currentFilters.page || 1,
      limit: this.config.resultsPerPage,
    };

    this.resultsGrid?.showLoading();

    try {
      const results = await this.dataLoader.searchProperties(searchFilters);
      this.resultsGrid?.render(results);

      // Track search
      if (this.config.enableTracking) {
        this.trackSearch(searchFilters, results);
      }

      this.emit('search', { filters: searchFilters, results });
      this.config.onSearch?.(searchFilters, results);
    } catch (error) {
      console.error('Search failed:', error);
      this.resultsGrid?.showError();
      this.emit('error', error as Error);
    }
  }

  /**
   * Handle search form submit
   */
  private handleSearch(filters: SearchFilters): void {
    this.currentFilters = { ...filters, page: 1 };
    this.search();
  }

  /**
   * Handle search form reset
   */
  private handleReset(): void {
    this.currentFilters = { page: 1 };
    this.search();
  }

  /**
   * Handle sort change
   */
  private handleSortChange(sortBy: SearchFilters['sortBy']): void {
    this.currentFilters.sortBy = sortBy;
    this.currentFilters.page = 1;
    this.search();
  }

  /**
   * Handle page change
   */
  private handlePageChange(page: number): void {
    this.currentFilters.page = page;
    this.search();

    // Scroll to top of results
    const resultsContainer = this.container.querySelector('#spw-results');
    resultsContainer?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * Handle property click - show detail modal
   */
  private async handlePropertyClick(property: Property): Promise<void> {
    this.emit('property:click', property);
    this.config.onPropertyClick?.(property);

    // Track view
    if (this.config.enableTracking) {
      this.trackView(property);
    }

    // Show detail modal
    this.propertyDetail = new PropertyDetail({
      property,
      labels: this.labels,
      currency: this.config.currency,
      enableInquiry: this.config.enableInquiry,
      onClose: () => {
        this.propertyDetail = null;
      },
      onInquiry: async (data) => {
        await this.handleInquiry(data);
      },
    });

    this.propertyDetail.show();
    this.emit('property:view', property);
  }

  /**
   * Handle favorite toggle
   */
  private handleFavoriteToggle(property: Property): void {
    if (this.favorites.has(property.id)) {
      this.favorites.delete(property.id);
      this.emit('favorite:remove', property);
    } else {
      this.favorites.add(property.id);
      this.emit('favorite:add', property);
    }

    // Save to storage
    storage.set('spw_favorites', Array.from(this.favorites));

    // Update UI
    this.resultsGrid?.updateFavorite(property.id, this.favorites.has(property.id));
  }

  /**
   * Handle inquiry submission
   */
  private async handleInquiry(data: InquiryData): Promise<void> {
    this.emit('inquiry:submit', data);

    try {
      await this.dataLoader.submitInquiry(data);
      this.emit('inquiry:success', data);
      this.config.onInquiry?.(data);
    } catch (error) {
      this.emit('inquiry:error', { data, error: error as Error });
      throw error;
    }
  }

  /**
   * Track property view
   */
  private trackView(property: Property): void {
    this.dataLoader.trackEvent({
      type: 'view',
      propertyId: property.id,
      sessionId: this.sessionId,
      referrer: document.referrer,
      timestamp: Date.now(),
    });
  }

  /**
   * Track search
   */
  private trackSearch(filters: SearchFilters, _results: SearchResults): void {
    this.dataLoader.trackEvent({
      type: 'search',
      sessionId: this.sessionId,
      filters,
      timestamp: Date.now(),
    });
  }

  /**
   * Get current favorites
   */
  public getFavorites(): number[] {
    return Array.from(this.favorites);
  }

  /**
   * Set filters programmatically
   */
  public setFilters(filters: SearchFilters): void {
    this.currentFilters = { ...filters };
    this.searchForm?.setFilters(filters);
  }

  /**
   * Get current filters
   */
  public getFilters(): SearchFilters {
    return { ...this.currentFilters };
  }

  /**
   * Refresh data (reload from API)
   */
  public async refresh(): Promise<void> {
    this.dataLoader.clearCache();
    await this.search();
  }

  /**
   * Destroy widget
   */
  public destroy(): void {
    this.dataLoader.stopSyncPolling();
    this.searchForm?.destroy();
    this.resultsGrid?.destroy();
    this.propertyDetail?.close();
    this.container.innerHTML = '';
    this.container.classList.remove('spw-widget', 'spw-theme-dark');
    this.isInitialized = false;
  }
}
