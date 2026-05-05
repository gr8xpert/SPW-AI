import type { SPMState, Action, ActionType, StateSlice } from '@/types';

type Listener = () => void;
type SliceListener<K extends StateSlice> = (value: SPMState[K], prev: SPMState[K]) => void;

const DEFAULT_STATE: SPMState = {
  config: { apiUrl: '', apiKey: '' },
  filters: {},
  lockedFilters: {},
  results: null,
  selectedProperty: null,
  favorites: [],
  labels: {} as SPMState['labels'],
  locations: [],
  propertyTypes: [],
  features: [],
  currency: { current: 'EUR', base: 'EUR', rates: {} },
  ui: {
    loading: true,
    searchLoading: false,
    detailLoading: false,
    error: null,
    layout: 'grid',
    mapVisible: true,
    chatOpen: false,
    favoritesOpen: false,
    detailOpen: false,
    initialized: false,
    highlightedPropertyId: null,
  },
  syncVersion: 0,
};

function reduce(state: SPMState, action: Action): SPMState {
  const { type, payload } = action;
  switch (type) {
    case 'SET_CONFIG':
      return { ...state, config: payload as SPMState['config'] };
    case 'SET_FILTERS':
      return { ...state, filters: payload as SPMState['filters'] };
    case 'MERGE_FILTERS':
      return { ...state, filters: { ...state.filters, ...(payload as Partial<SPMState['filters']>) } };
    case 'RESET_FILTERS':
      return { ...state, filters: {} };
    case 'SET_LOCKED_FILTERS':
      return { ...state, lockedFilters: payload as SPMState['lockedFilters'] };
    case 'SET_RESULTS':
      return { ...state, results: payload as SPMState['results'] };
    case 'SET_SELECTED_PROPERTY':
      return { ...state, selectedProperty: payload as SPMState['selectedProperty'] };
    case 'ADD_FAVORITE': {
      const id = payload as number;
      if (state.favorites.includes(id)) return state;
      return { ...state, favorites: [...state.favorites, id] };
    }
    case 'REMOVE_FAVORITE': {
      const id = payload as number;
      return { ...state, favorites: state.favorites.filter(f => f !== id) };
    }
    case 'SET_FAVORITES':
      return { ...state, favorites: payload as number[] };
    case 'SET_LABELS':
      return { ...state, labels: payload as SPMState['labels'] };
    case 'SET_LOCATIONS':
      return { ...state, locations: payload as SPMState['locations'] };
    case 'SET_PROPERTY_TYPES':
      return { ...state, propertyTypes: payload as SPMState['propertyTypes'] };
    case 'SET_FEATURES':
      return { ...state, features: payload as SPMState['features'] };
    case 'SET_CURRENCY':
      return { ...state, currency: { ...state.currency, current: payload as string } };
    case 'SET_CURRENCY_RATES':
      return { ...state, currency: { ...state.currency, rates: payload as Record<string, number> } };
    case 'SET_UI':
      return { ...state, ui: payload as SPMState['ui'] };
    case 'MERGE_UI':
      return { ...state, ui: { ...state.ui, ...(payload as Partial<SPMState['ui']>) } };
    case 'SET_SYNC_VERSION':
      return { ...state, syncVersion: payload as number };
    case 'HYDRATE':
      return { ...state, ...(payload as Partial<SPMState>) };
    default:
      return state;
  }
}

class SPMStore {
  private state: SPMState;
  private listeners = new Set<Listener>();
  private sliceListeners = new Map<StateSlice, Set<SliceListener<StateSlice>>>();

  constructor() {
    this.state = { ...DEFAULT_STATE };
  }

  getState(): SPMState {
    return this.state;
  }

  get<K extends StateSlice>(key: K): SPMState[K] {
    return this.state[key];
  }

  dispatch(type: ActionType, payload?: unknown): void {
    const prev = this.state;
    this.state = reduce(prev, { type, payload });

    if (this.state === prev) return;

    this.listeners.forEach(fn => {
      try { fn(); } catch { /* listener error */ }
    });

    this.sliceListeners.forEach((fns, slice) => {
      if (this.state[slice] !== prev[slice]) {
        fns.forEach(fn => {
          try { fn(this.state[slice], prev[slice]); } catch { /* listener error */ }
        });
      }
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeSlice<K extends StateSlice>(slice: K, listener: SliceListener<K>): () => void {
    if (!this.sliceListeners.has(slice)) {
      this.sliceListeners.set(slice, new Set());
    }
    const set = this.sliceListeners.get(slice)!;
    set.add(listener as SliceListener<StateSlice>);
    return () => set.delete(listener as SliceListener<StateSlice>);
  }

  getSnapshot = (): SPMState => this.state;

  getServerSnapshot = (): SPMState => this.state;

  reset(): void {
    this.state = { ...DEFAULT_STATE };
    this.listeners.forEach(fn => {
      try { fn(); } catch { /* listener error */ }
    });
  }
}

export const store = new SPMStore();
export type { SPMStore };
