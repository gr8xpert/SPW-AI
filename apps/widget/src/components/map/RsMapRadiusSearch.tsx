import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import { useFilters } from '@/hooks/useFilters';

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

const DEFAULT_RADIUS_OPTIONS = [1, 2, 5, 10, 25, 50];
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

export default function RsMapRadiusSearch() {
  const { t } = useLabels();
  const config = useConfig();
  const { filters, setFilter } = useFilters();

  const radiusOptions = config.radiusOptions ?? DEFAULT_RADIUS_OPTIONS;

  const [address, setAddress] = useState('');
  const [radius, setRadius] = useState<number>(radiusOptions[2] ?? 5);
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close suggestions on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const geocodeAddress = useCallback(async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    try {
      const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=5`;
      const resp = await fetch(url);
      const data: NominatimResult[] = await resp.json();
      setSuggestions(data);
      setShowSuggestions(data.length > 0);
    } catch {
      setSuggestions([]);
    }
  }, []);

  const handleInput = useCallback(
    (e: Event) => {
      const value = (e.target as HTMLInputElement).value;
      setAddress(value);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        geocodeAddress(value);
      }, 400);
    },
    [geocodeAddress],
  );

  const handleSelectSuggestion = useCallback(
    (suggestion: NominatimResult) => {
      setAddress(suggestion.display_name);
      setShowSuggestions(false);
      setSuggestions([]);

      const lat = parseFloat(suggestion.lat);
      const lng = parseFloat(suggestion.lon);
      setFilter('lat', lat);
      setFilter('lng', lng);
      setFilter('radius', radius);
      window.RealtySoft?.search();
    },
    [radius, setFilter],
  );

  const handleSubmit = useCallback(
    async (e: Event) => {
      e.preventDefault();
      if (!address.trim()) return;

      setIsGeocoding(true);
      try {
        const url = `${NOMINATIM_URL}?q=${encodeURIComponent(address)}&format=json&limit=1`;
        const resp = await fetch(url);
        const data: NominatimResult[] = await resp.json();
        if (data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lng = parseFloat(data[0].lon);
          setFilter('lat', lat);
          setFilter('lng', lng);
          setFilter('radius', radius);
          setAddress(data[0].display_name);
          window.RealtySoft?.search();
        }
      } catch {
        // Geocoding failed silently
      } finally {
        setIsGeocoding(false);
        setShowSuggestions(false);
      }
    },
    [address, radius, setFilter],
  );

  const handleRadiusChange = useCallback(
    (e: Event) => {
      const value = parseInt((e.target as HTMLSelectElement).value, 10);
      setRadius(value);
      if (filters.lat != null && filters.lng != null) {
        setFilter('radius', value);
        window.RealtySoft?.search();
      }
    },
    [filters.lat, filters.lng, setFilter],
  );

  const handleClear = useCallback(() => {
    setAddress('');
    setSuggestions([]);
    setShowSuggestions(false);
    setFilter('lat', undefined as any);
    setFilter('lng', undefined as any);
    setFilter('radius', undefined as any);
    setFilter('bounds', undefined as any);
    window.RealtySoft?.search();
  }, [setFilter]);

  return (
    <form class="rs-map-radius" onSubmit={handleSubmit}>
      <div class="rs-map-radius__input-wrap rs-dropdown-wrap" ref={wrapRef}>
        <input
          type="text"
          class="rs-input"
          placeholder={t('map_search_address', 'Search address...')}
          value={address}
          onInput={handleInput}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
        />
        {address && (
          <button
            type="button"
            class="rs-map-radius__clear"
            onClick={handleClear}
            aria-label={t('close', 'Close')}
          >
            &times;
          </button>
        )}
        {showSuggestions && suggestions.length > 0 && (
          <ul class="rs-dropdown">
            {suggestions.map((s, i) => (
              <li
                key={i}
                class="rs-dropdown__item"
                onClick={() => handleSelectSuggestion(s)}
              >
                {s.display_name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div class="rs-map-radius__distance">
        <select
          class="rs-select"
          value={radius}
          onChange={handleRadiusChange}
        >
          {radiusOptions.map((km) => (
            <option key={km} value={km}>
              {km} km
            </option>
          ))}
        </select>
      </div>

      <button type="submit" class="rs-search-btn" disabled={isGeocoding || !address.trim()}>
        {isGeocoding ? t('loading', 'Loading...') : t('map_radius', 'Search Area')}
      </button>
    </form>
  );
}
