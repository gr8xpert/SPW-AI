import type { WidgetConfig, RealtySoftConfig, ThemeVars } from '@/types';

declare global {
  interface Window {
    RealtySoftConfig?: RealtySoftConfig;
  }
}

const DEFAULT_CONFIG: Partial<WidgetConfig> = {
  dataPath: '/spw-data',
  language: 'en',
  currency: 'EUR',
  theme: 'light',
  resultsPerPage: 12,
  enableFavorites: true,
  enableInquiry: true,
  enableTracking: true,
  enableAiChat: false,
  enableMortgageCalculator: false,
  mapSearchEnabled: false,
  similarProperties: true,
  syncPollIntervalMs: 60_000,
  radiusOptions: [1, 2, 5, 10, 25, 50],
  geocodingProvider: 'nominatim',
};

export function parseConfig(): WidgetConfig {
  const legacy = parseLegacyConfig();
  const v2El = document.querySelector<HTMLElement>('[data-spw-widget]');
  const v2Attrs = v2El ? parseV2Attributes(v2El) : {};

  const merged: WidgetConfig = {
    ...DEFAULT_CONFIG,
    ...legacy,
    ...v2Attrs,
  } as WidgetConfig;

  return merged;
}

function parseLegacyConfig(): Partial<WidgetConfig> {
  const rc = window.RealtySoftConfig;
  if (!rc) return {};

  const config: Partial<WidgetConfig> = {};
  if (rc.apiUrl) config.apiUrl = rc.apiUrl;
  if (rc.apiKey) config.apiKey = rc.apiKey;
  if (rc.language) config.language = rc.language;
  if (rc.currency) config.currency = rc.currency;
  if (rc.theme) config.theme = rc.theme as WidgetConfig['theme'];
  if (rc.resultsPerPage) config.resultsPerPage = rc.resultsPerPage;
  if (rc.propertyPageSlug) config.propertyPageSlug = rc.propertyPageSlug;
  if (rc.propertyPageUrl) config.propertyPageUrl = rc.propertyPageUrl;
  if (rc.resultsPage) config.resultsPage = rc.resultsPage;
  if (rc.searchTemplate) config.searchTemplateId = rc.searchTemplate;
  if (rc.listingTemplate) config.listingTemplateId = rc.listingTemplate;
  if (rc.mapTemplate) config.defaultMapTemplate = rc.mapTemplate;
  if (rc.enableChat != null) config.enableAiChat = rc.enableChat;
  if (rc.enableFavorites != null) config.enableFavorites = rc.enableFavorites;
  if (rc.onSearch) config.onSearch = rc.onSearch;
  if (rc.onPropertyClick) config.onPropertyClick = rc.onPropertyClick;

  return config;
}

function parseV2Attributes(el: HTMLElement): Partial<WidgetConfig> {
  const config: Partial<WidgetConfig> = {};

  const str = (attr: string) => el.getAttribute(`data-spw-${attr}`);
  const num = (attr: string) => {
    const v = str(attr);
    return v ? parseInt(v, 10) : undefined;
  };
  const bool = (attr: string) => {
    const v = str(attr);
    return v === 'true' ? true : v === 'false' ? false : undefined;
  };

  const apiUrl = str('api-url');
  const apiKey = str('api-key');
  if (apiUrl) config.apiUrl = apiUrl;
  if (apiKey) config.apiKey = apiKey;
  if (str('data-path')) config.dataPath = str('data-path')!;
  if (str('language')) config.language = str('language')!;
  if (str('currency')) config.currency = str('currency')!;
  if (str('theme')) config.theme = str('theme') as WidgetConfig['theme'];
  if (num('results-per-page')) config.resultsPerPage = num('results-per-page');
  if (bool('enable-favorites') != null) config.enableFavorites = bool('enable-favorites');
  if (bool('enable-inquiry') != null) config.enableInquiry = bool('enable-inquiry');
  if (bool('enable-tracking') != null) config.enableTracking = bool('enable-tracking');
  if (bool('enable-ai-chat') != null) config.enableAiChat = bool('enable-ai-chat');

  return config;
}

export function mergeWithDashboardConfig(
  config: WidgetConfig,
  dashboardConfig: Partial<WidgetConfig>,
): WidgetConfig {
  return { ...config, ...dashboardConfig };
}

const DEFAULT_THEME: ThemeVars = {
  '--rs-primary': '#2563eb',
  '--rs-primary-hover': '#1d4ed8',
  '--rs-primary-light': '#eff6ff',
  '--rs-text': '#1e293b',
  '--rs-text-light': '#64748b',
  '--rs-bg': '#ffffff',
  '--rs-bg-secondary': '#f8fafc',
  '--rs-border': '#e2e8f0',
  '--rs-radius': '8px',
  '--rs-shadow': '0 1px 3px rgba(0,0,0,0.1)',
  '--rs-font': 'system-ui, -apple-system, sans-serif',
};

export function applyTheme(config: WidgetConfig): void {
  const root = document.documentElement;
  const vars = { ...DEFAULT_THEME };

  if (config.primaryColor) {
    vars['--rs-primary'] = config.primaryColor;
  }

  if (config.customStyles) {
    for (const [key, value] of Object.entries(config.customStyles)) {
      vars[key.startsWith('--rs-') ? key : `--rs-${key}`] = value;
    }
  }

  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}
