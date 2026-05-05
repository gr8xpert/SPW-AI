import type { Property, SearchResults, Location, PropertyType, Feature } from './property';
import type { SearchFilters, LockedFilters } from './search';
import type { WidgetConfig } from './config';
import type { Labels } from './labels';

export interface SPMState {
  config: WidgetConfig;
  filters: SearchFilters;
  lockedFilters: LockedFilters;
  results: SearchResults | null;
  selectedProperty: Property | null;
  favorites: number[];
  labels: Labels;
  locations: Location[];
  propertyTypes: PropertyType[];
  features: Feature[];
  currency: CurrencyState;
  ui: UIState;
  syncVersion: number;
}

export interface CurrencyState {
  current: string;
  base: string;
  rates: Record<string, number>;
}

export interface UIState {
  loading: boolean;
  searchLoading: boolean;
  detailLoading: boolean;
  error: string | null;
  layout: 'grid' | 'list' | 'map';
  mapVisible: boolean;
  chatOpen: boolean;
  favoritesOpen: boolean;
  detailOpen: boolean;
  initialized: boolean;
  highlightedPropertyId: number | null;
}

export type StateSlice = keyof SPMState;

export type ActionType =
  | 'SET_CONFIG'
  | 'SET_FILTERS'
  | 'MERGE_FILTERS'
  | 'RESET_FILTERS'
  | 'SET_LOCKED_FILTERS'
  | 'SET_RESULTS'
  | 'SET_SELECTED_PROPERTY'
  | 'ADD_FAVORITE'
  | 'REMOVE_FAVORITE'
  | 'SET_FAVORITES'
  | 'SET_LABELS'
  | 'SET_LOCATIONS'
  | 'SET_PROPERTY_TYPES'
  | 'SET_FEATURES'
  | 'SET_CURRENCY'
  | 'SET_CURRENCY_RATES'
  | 'SET_UI'
  | 'MERGE_UI'
  | 'SET_SYNC_VERSION'
  | 'HYDRATE';

export interface Action {
  type: ActionType;
  payload?: unknown;
}
