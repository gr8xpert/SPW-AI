import { useCallback } from 'preact/hooks';
import { useSelector } from './useStore';
import { selectors } from '@/core/selectors';
import { actions } from '@/core/actions';
import type { SearchFilters } from '@/types';

export function useFilters() {
  const filters = useSelector(selectors.getFilters);
  const lockedFilters = useSelector(selectors.getLockedFilters);
  const effectiveFilters = useSelector(selectors.getEffectiveFilters);

  const setFilter = useCallback(<K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
    actions.mergeFilters({ [key]: value });
  }, []);

  const resetFilters = useCallback(() => {
    actions.resetFilters();
  }, []);

  const isLocked = useCallback((key: keyof SearchFilters): boolean => {
    return key in lockedFilters && (lockedFilters as Record<string, unknown>)[key] != null;
  }, [lockedFilters]);

  return {
    filters,
    lockedFilters,
    effectiveFilters,
    setFilter,
    resetFilters,
    isLocked,
  };
}
