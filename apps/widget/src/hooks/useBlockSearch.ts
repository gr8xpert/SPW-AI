import { useEffect, useMemo, useState } from 'preact/hooks';
import { getDataLoader } from '@/core/data-loader';
import { filtersFromAttributes } from '@/core/filter-attributes';
import { elementAttributes } from '@/core/attribute-parser';
import type { SearchFilters, SearchResults } from '@/types';

export interface BlockSearch {
  // True when this block runs its own search instead of showing the page's results.
  enabled: boolean;
  results: SearchResults | null;
  loading: boolean;
}

// A block with `data-spm-standalone` searches on its own, so one page can hold
// several different lists ("Latest in Marbella", "New developments", …). The
// filters come from the block's own data-spm-* attributes; the page's search
// form does not affect it.
export function useBlockSearch(props: Record<string, unknown>): BlockSearch {
  // Read the block's own attributes rather than its props: a few names (`ref`,
  // `key`) belong to the view layer and never reach props, and the element is
  // the thing the author actually wrote.
  const element = props._element as HTMLElement | undefined;
  const attrs = useMemo(
    () => (element ? elementAttributes(element) : props),
    [element, props],
  );
  const enabled = attrs.standalone !== undefined && attrs.standalone !== 'false';
  const key = useMemo(() => {
    if (!enabled) return '';
    const { filters } = filtersFromAttributes(attrs);
    return JSON.stringify(filters, Object.keys(filters).sort());
  }, [enabled, attrs]);

  // A saved copy of this block's answer (this browser's last visit) is drawn
  // at once; the live answer replaces it.
  const [state, setState] = useState<{ results: SearchResults | null; loading: boolean }>(() => {
    if (!enabled) return { results: null, loading: false };
    const saved = getDataLoader()?.peekSearch({ page: 1, limit: 6, ...(JSON.parse(key) as SearchFilters) }) ?? null;
    return { results: saved, loading: !saved };
  });

  useEffect(() => {
    if (!enabled) return;
    const loader = getDataLoader();
    if (!loader) return;
    let cancelled = false;
    const filters: SearchFilters = { page: 1, limit: 6, ...(JSON.parse(key) as SearchFilters) };
    const saved = loader.peekSearch(filters);
    setState((s) => (saved ? { results: saved, loading: false } : { ...s, loading: true }));
    loader
      .searchProperties(filters, { fresh: !!saved })
      .then((results) => {
        if (!cancelled) setState({ results, loading: false });
      })
      .catch(() => {
        // Keep a saved copy on screen rather than an empty block.
        if (!cancelled) setState((s) => ({ results: saved ?? s.results, loading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, key]);

  return { enabled, results: state.results, loading: state.loading };
}
