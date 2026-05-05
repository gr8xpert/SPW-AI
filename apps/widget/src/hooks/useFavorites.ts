import { useCallback } from 'preact/hooks';
import { useSelector } from './useStore';
import { selectors } from '@/core/selectors';
import { actions } from '@/core/actions';
import { store } from '@/core/store';

const STORAGE_KEY = 'spm_favorites';

export function useFavorites() {
  const favorites = useSelector(selectors.getFavorites);

  const isFavorite = useCallback((id: number): boolean => {
    return favorites.includes(id);
  }, [favorites]);

  const toggle = useCallback((id: number) => {
    if (favorites.includes(id)) {
      actions.removeFavorite(id);
    } else {
      actions.addFavorite(id);
    }
    persistFavorites();
  }, [favorites]);

  const add = useCallback((id: number) => {
    actions.addFavorite(id);
    persistFavorites();
  }, []);

  const remove = useCallback((id: number) => {
    actions.removeFavorite(id);
    persistFavorites();
  }, []);

  return { favorites, isFavorite, toggle, add, remove, count: favorites.length };
}

function persistFavorites(): void {
  try {
    const favs = store.get('favorites');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
  } catch { /* localStorage not available */ }
}

export function loadPersistedFavorites(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* localStorage not available */ }
  return [];
}
