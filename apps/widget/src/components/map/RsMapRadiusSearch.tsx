import { useState, useCallback, useRef, useEffect, useMemo } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import { useFilters } from '@/hooks/useFilters';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import { toCoord } from '@/core/map-support';
import type { Location } from '@/types';

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

const DEFAULT_RADIUS_OPTIONS = [1, 2, 5, 10, 25, 50];
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const MAX_SUGGESTIONS = 8;

const fold = (s: string) =>
  s
    .normalize('NFD')
    .split('')
    .filter((c) => c.charCodeAt(0) < 0x300 || c.charCodeAt(0) > 0x36f)
    .join('')
    .toLowerCase()
    .trim();

// One address lookup per search the visitor submits. Suggestions while typing
// come from the site's own locations: OpenStreetMap's geocoder does not allow
// search-as-you-type use.
async function geocode(query: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const resp = await fetch(`${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1`, {
    headers: { Accept: 'application/json' },
  });
  if (!resp.ok) return null;
  const data: NominatimResult[] = await resp.json();
  const hit = data[0];
  const lat = toCoord(hit?.lat);
  const lng = toCoord(hit?.lon);
  return hit && lat != null && lng != null ? { lat, lng, label: hit.display_name } : null;
}

export default function RsMapRadiusSearch() {
  const { t } = useLabels();
  const config = useConfig();
  const { filters, setFilter } = useFilters();
  const locations = useSelector(selectors.getLocations);

  const radiusOptions = config.radiusOptions ?? DEFAULT_RADIUS_OPTIONS;

  const [address, setAddress] = useState('');
  const [radius, setRadius] = useState<number>(toCoord(filters.radius) ?? radiusOptions[2] ?? 5);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const suggestions = useMemo(() => {
    const q = fold(address);
    if (q.length < 2) return [] as Location[];
    const starts: Location[] = [];
    const contains: Location[] = [];
    for (const loc of locations) {
      const name = fold(loc.name);
      if (name.startsWith(q)) starts.push(loc);
      else if (name.includes(q)) contains.push(loc);
    }
    const byCount = (a: Location, b: Location) => (b.propertyCount ?? 0) - (a.propertyCount ?? 0);
    // A municipality and its main town often share a name: list it once,
    // preferring the entry that has map coordinates.
    const seen = new Map<string, Location>();
    for (const loc of [...starts.sort(byCount), ...contains.sort(byCount)]) {
      const key = fold(loc.name);
      const prev = seen.get(key);
      if (!prev) seen.set(key, loc);
      else if (toCoord(prev.lat) == null && toCoord(loc.lat) != null) seen.set(key, loc);
    }
    return [...seen.values()].slice(0, MAX_SUGGESTIONS);
  }, [address, locations]);

  const applyCentre = useCallback(
    (lat: number, lng: number) => {
      setFilter('bounds', undefined as any);
      setFilter('lat', lat);
      setFilter('lng', lng);
      setFilter('radius', radius);
      setFilter('page', 1);
      window.RealtySoft?.search();
    },
    [radius, setFilter],
  );

  const searchFor = useCallback(
    async (query: string, loc?: Location) => {
      setOpen(false);
      setNotFound(false);
      const lat = toCoord(loc?.lat);
      const lng = toCoord(loc?.lng);
      if (loc && lat != null && lng != null) {
        setAddress(loc.name);
        applyCentre(lat, lng);
        return;
      }
      setBusy(true);
      try {
        const hit = await geocode(query);
        if (hit) {
          setAddress(loc ? loc.name : hit.label);
          applyCentre(hit.lat, hit.lng);
        } else {
          setNotFound(true);
        }
      } catch {
        setNotFound(true);
      } finally {
        setBusy(false);
      }
    },
    [applyCentre],
  );

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (open && active >= 0 && suggestions[active]) {
      searchFor(suggestions[active].name, suggestions[active]);
      return;
    }
    const query = address.trim();
    if (!query) return;
    // A typed name that is one of the site's locations needs no lookup.
    const exact = locations.find((l) => fold(l.name) === fold(query));
    searchFor(query, exact);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const handleRadiusChange = (e: Event) => {
    const value = parseInt((e.target as HTMLSelectElement).value, 10);
    setRadius(value);
    if (filters.lat != null && filters.lng != null) {
      setFilter('radius', value);
      setFilter('page', 1);
      window.RealtySoft?.search();
    }
  };

  const handleClear = () => {
    setAddress('');
    setOpen(false);
    setNotFound(false);
    if (filters.lat != null || filters.bounds) {
      setFilter('lat', undefined as any);
      setFilter('lng', undefined as any);
      setFilter('radius', undefined as any);
      setFilter('bounds', undefined as any);
      setFilter('page', 1);
      window.RealtySoft?.search();
    }
  };

  return (
    <form class="rs-map-radius" onSubmit={handleSubmit} role="search">
      <div class="rs-map-radius__input-wrap" ref={wrapRef}>
        <svg class="rs-map-radius__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <input
          type="text"
          class="rs-map-radius__input"
          placeholder={t('map_search_address', 'Town, area or address')}
          aria-label={t('map_search_address', 'Town, area or address')}
          value={address}
          autoComplete="off"
          onInput={(e) => {
            setAddress((e.target as HTMLInputElement).value);
            setOpen(true);
            setActive(-1);
            setNotFound(false);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {address && (
          <button type="button" class="rs-map-radius__clear" onClick={handleClear} aria-label={t('clear', 'Clear')}>
            &times;
          </button>
        )}
        {open && suggestions.length > 0 && (
          <ul class="rs-map-radius__suggestions" role="listbox">
            {suggestions.map((loc, i) => (
              <li
                key={loc.id}
                role="option"
                aria-selected={i === active}
                class={`rs-map-radius__suggestion${i === active ? ' rs-map-radius__suggestion--active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  searchFor(loc.name, loc);
                }}
              >
                <span>{loc.name}</span>
                {!!loc.propertyCount && <span class="rs-map-radius__suggestion-count">{loc.propertyCount}</span>}
              </li>
            ))}
          </ul>
        )}
        {notFound && <div class="rs-map-radius__error">{t('map_address_not_found', 'We could not find that place')}</div>}
      </div>

      <label class="rs-map-radius__distance">
        <span class="rs-map-radius__within">{t('map_within', 'Within')}</span>
        <select class="rs-map-radius__select" value={radius} onChange={handleRadiusChange}>
          {radiusOptions.map((km) => (
            <option key={km} value={km}>
              {km} km
            </option>
          ))}
        </select>
      </label>

      <button type="submit" class="rs-map-radius__submit" disabled={busy || !address.trim()}>
        {busy ? t('loading', 'Loading...') : t('map_radius', 'Search area')}
      </button>
    </form>
  );
}
