import { useCallback } from 'preact/hooks';
import { useSelector } from './useStore';
import { selectors } from '@/core/selectors';

export function useLabels() {
  const labels = useSelector(selectors.getLabels);

  const t = useCallback((key: string, fallback?: string): string => {
    return (labels as Record<string, string>)[key] ?? fallback ?? key;
  }, [labels]);

  return { labels, t };
}
