import type { WidgetConfig, RealtySoftConfig, ThemeVars } from '@/types';

declare global {
  interface Window {
    RealtySoftConfig?: RealtySoftConfig;
  }
}

const DEFAULT_CONFIG: Partial<WidgetConfig> = {
  dataPath: '/spm-data',
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
  bedroomOptions: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  bathroomOptions: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  priceOptions: {
    sale: [50000, 100000, 150000, 200000, 250000, 300000, 400000, 500000, 600000, 750000, 1000000, 1500000, 2000000, 3000000, 5000000],
    rent: [250, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000],
    holiday_rent: [150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 5000],
  },
  radiusOptions: [1, 2, 5, 10, 25, 50],
  geocodingProvider: 'nominatim',
};

export function parseConfig(): WidgetConfig {
  const legacy = parseLegacyConfig();
  const v2El = document.querySelector<HTMLElement>('[data-spm-widget]');
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
  if (rc.propertyRefPosition) config.propertyRefPosition = rc.propertyRefPosition;
  if (rc.defaultListingType) config.defaultListingType = rc.defaultListingType;
  if (rc.enabledListingTypes) config.enabledListingTypes = rc.enabledListingTypes;
  if (rc.resultsPage) config.resultsPage = rc.resultsPage;
  if (rc.searchTemplate) config.searchTemplateId = rc.searchTemplate;
  if (rc.listingTemplate) config.listingTemplateId = rc.listingTemplate;
  if (rc.mapTemplate) config.defaultMapTemplate = rc.mapTemplate;
  if (rc.enableChat != null) config.enableAiChat = rc.enableChat;
  if (rc.enableFavorites != null) config.enableFavorites = rc.enableFavorites;
  if (rc.primaryColor) config.primaryColor = rc.primaryColor;
  if (rc.onSearch) config.onSearch = rc.onSearch;
  if (rc.onPropertyClick) config.onPropertyClick = rc.onPropertyClick;

  return config;
}

function parseV2Attributes(el: HTMLElement): Partial<WidgetConfig> {
  const config: Partial<WidgetConfig> = {};

  const str = (attr: string) => el.getAttribute(`data-spm-${attr}`);
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

const USER_PROTECTED_KEYS: (keyof WidgetConfig)[] = [
  'enabledListingTypes',
  'defaultListingType',
  'propertyPageSlug',
  'propertyPageUrl',
  'propertyRefPosition',
  'resultsPage',
  'wishlistPage',
  'enableFavorites',
  'enableInquiry',
  'enableAiChat',
  'primaryColor',
  'bedroomOptions',
  'bathroomOptions',
  'priceOptions',
  'radiusOptions',
  'quickFeatureIds',
  'onPropertyClick',
  'onSearch',
  'onInquiry',
];

export function mergeWithDashboardConfig(
  config: WidgetConfig,
  dashboardConfig: Partial<WidgetConfig>,
): WidgetConfig {
  const merged = { ...config, ...dashboardConfig };
  for (const key of USER_PROTECTED_KEYS) {
    if ((config as unknown as Record<string, unknown>)[key] !== undefined) {
      (merged as unknown as Record<string, unknown>)[key] = (config as unknown as Record<string, unknown>)[key];
    }
  }
  return merged;
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
  '--rs-radius': '4px',
  '--rs-shadow': '0 1px 3px rgba(0,0,0,0.1)',
  '--rs-font': 'system-ui, -apple-system, sans-serif',
};

function hexToHSL(hex: string): [number, number, number] | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function applyTheme(config: WidgetConfig): void {
  const root = document.documentElement;
  const vars = { ...DEFAULT_THEME };

  if (config.primaryColor) {
    vars['--rs-primary'] = config.primaryColor;
    const hsl = hexToHSL(config.primaryColor);
    if (hsl) {
      vars['--rs-primary-hover'] = hslToHex(hsl[0], hsl[1], Math.max(hsl[2] - 10, 0));
      vars['--rs-primary-light'] = hslToHex(hsl[0], Math.min(hsl[1], 80), 95);
    }
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
