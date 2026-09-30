import type { SearchResults, WidgetConfig } from '@/types';

// What the browser keeps between visits so a returning visitor sees the page
// at once: the dashboard settings and the last few searches, per site (API
// key) and language. Everything shown from here is refreshed from the API
// straight after, so it only has to be recent, not exact.
//
// localStorage can be full, blocked (private windows, strict cookie settings)
// or throw on access; every call is guarded and simply finds nothing then.

const PREFIX = 'spm:v1:';
const MAX_SEARCHES = 20;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
// A single entry bigger than this (a 100-card page) isn't worth the space.
const MAX_ENTRY_CHARS = 400_000;

interface StoredSearch { t: number; r: SearchResults }

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch { /* full or blocked: nothing kept */ }
}

// The same string for the same search however its filters were written:
// the API query string with its parameters in a fixed order.
export function searchKey(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k, String(v)] as [string, string])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return new URLSearchParams(entries).toString();
}

export class SnapshotCache {
  private scope: string;

  constructor(apiKey: string, language: string) {
    // The key's tail is enough to tell sites apart, without storing the key.
    this.scope = `${(apiKey || '').slice(-12)}:${language || 'en'}`;
  }

  readConfig(): Partial<WidgetConfig> | null {
    const c = read<{ t: number; c: Partial<WidgetConfig> }>(`${this.scope}:config`);
    return c && Date.now() - c.t < 7 * MAX_AGE_MS ? c.c : null;
  }

  writeConfig(config: Partial<WidgetConfig>): void {
    write(`${this.scope}:config`, { t: Date.now(), c: config });
  }

  readSearch(key: string): SearchResults | null {
    const all = read<Record<string, StoredSearch>>(`${this.scope}:search`);
    const hit = all?.[key];
    return hit && Date.now() - hit.t < MAX_AGE_MS ? hit.r : null;
  }

  writeSearch(key: string, results: SearchResults): void {
    let size = 0;
    try { size = JSON.stringify(results).length; } catch { return; }
    if (size > MAX_ENTRY_CHARS) return;
    const all = read<Record<string, StoredSearch>>(`${this.scope}:search`) || {};
    all[key] = { t: Date.now(), r: results };
    // Keep the newest few.
    const keep = Object.entries(all)
      .filter(([, v]) => v && Date.now() - v.t < MAX_AGE_MS)
      .sort(([, a], [, b]) => b.t - a.t)
      .slice(0, MAX_SEARCHES);
    write(`${this.scope}:search`, Object.fromEntries(keep));
  }
}
