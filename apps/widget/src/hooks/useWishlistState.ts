import { useSyncExternalStore } from 'preact/compat';

export interface WishlistUIState {
  compareSelection: number[];
  notes: Record<number, string>;
  sortBy: 'date_added' | 'price_asc' | 'price_desc';
  activeModal: 'share' | 'email' | 'compare' | null;
  editingNote: number | null;
}

let state: WishlistUIState = {
  compareSelection: [],
  notes: loadNotes(),
  sortBy: 'date_added',
  activeModal: null,
  editingNote: null,
};

const listeners = new Set<() => void>();

function notify(): void {
  state = { ...state };
  listeners.forEach((fn) => fn());
}

function loadNotes(): Record<number, string> {
  try {
    return JSON.parse(localStorage.getItem('spm_wishlist_notes') || '{}');
  } catch {
    return {};
  }
}

function persistNotes(): void {
  try {
    localStorage.setItem('spm_wishlist_notes', JSON.stringify(state.notes));
  } catch { /* */ }
}

export const wishlistActions = {
  toggleCompare(id: number): void {
    const idx = state.compareSelection.indexOf(id);
    state.compareSelection = idx >= 0
      ? state.compareSelection.filter((i) => i !== id)
      : [...state.compareSelection, id];
    notify();
  },
  clearCompare(): void {
    state.compareSelection = [];
    notify();
  },
  setNote(id: number, note: string): void {
    state.notes = { ...state.notes, [id]: note };
    persistNotes();
    notify();
  },
  removeNote(id: number): void {
    const copy = { ...state.notes };
    delete copy[id];
    state.notes = copy;
    persistNotes();
    notify();
  },
  setSortBy(sortBy: WishlistUIState['sortBy']): void {
    state.sortBy = sortBy;
    notify();
  },
  openModal(modal: WishlistUIState['activeModal']): void {
    state.activeModal = modal;
    notify();
  },
  closeModal(): void {
    state.activeModal = null;
    notify();
  },
  setEditingNote(id: number | null): void {
    state.editingNote = id;
    notify();
  },
};

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): WishlistUIState {
  return state;
}

export function useWishlistState(): WishlistUIState {
  return useSyncExternalStore(subscribe, getSnapshot);
}
