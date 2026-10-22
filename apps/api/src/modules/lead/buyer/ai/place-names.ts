import { locationKey } from '../../../location-template/location-name';

// Place names from a model's reply → the agency's locations. The model is
// never shown location ids (an agency can have thousands of places), so it
// writes names and we look them up: exact name or alias in any language,
// else a single place whose name contains it, else a single place within
// two typos. Unresolved names come back with id null for the agent to see.

export interface NamedPlace {
  id: number;
  name: Record<string, string> | string | null;
  aliases?: string[] | null;
  level: string;
}

export interface ResolvedPlace {
  name: string;
  id: number | null;
  label: string | null;
}

const MAX_PLACES = 10;
const ARTICLE = /^(the|la|el|los|las|les|le|l|de|het|der|die|das)\s+/;

const names = (n: NamedPlace['name']): string[] => (typeof n === 'string' ? [n] : n ? Object.values(n) : []);
const english = (p: NamedPlace): string | null =>
  typeof p.name === 'string' ? p.name : p.name?.en || names(p.name)[0] || null;
const plain = (s: string): string => {
  const k = locationKey(s);
  return k.replace(ARTICLE, '');
};

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function resolvePlaces(raw: unknown, places: NamedPlace[]): ResolvedPlace[] {
  if (!Array.isArray(raw)) return [];
  const keyed = places.map((p) => ({ p, keys: [...new Set([...names(p.name), ...(p.aliases ?? [])].map(plain).filter(Boolean))] }));
  const pick = (found: NamedPlace[]): NamedPlace => found.find((p) => p.level === 'town') ?? found[0];
  const unique = (found: NamedPlace[]): NamedPlace | null => (new Set(found.map((p) => p.id)).size === 1 ? found[0] : null);

  const find = (name: string): NamedPlace | null => {
    const k = plain(name);
    if (k.replace(/ /g, '').length < 3) return null;
    const exact = keyed.filter((e) => e.keys.includes(k)).map((e) => e.p);
    if (exact.length) return pick(exact);
    if (k.length >= 4) {
      const partial = unique(keyed.filter((e) => e.keys.some((x) => x.includes(k) || (x.length >= 5 && k.includes(x)))).map((e) => e.p));
      if (partial) return partial;
    }
    if (k.length >= 6) {
      let best = 3;
      let hits: NamedPlace[] = [];
      for (const e of keyed) {
        const d = Math.min(...e.keys.map((x) => distance(k, x)));
        if (d < best) {
          best = d;
          hits = [e.p];
        } else if (d === best) hits.push(e.p);
      }
      if (best <= 2) return unique(hits);
    }
    return null;
  };

  const out: ResolvedPlace[] = [];
  const seen = new Set<number>();
  for (const value of raw) {
    if (out.length >= MAX_PLACES) break;
    if (typeof value !== 'string') continue;
    const name = value.trim().slice(0, 80);
    if (plain(name).replace(/ /g, '').length < 2) continue;
    const place = find(name);
    if (place && seen.has(place.id)) continue;
    if (place) seen.add(place.id);
    out.push({ name, id: place?.id ?? null, label: place ? english(place) : null });
  }
  return out;
}
