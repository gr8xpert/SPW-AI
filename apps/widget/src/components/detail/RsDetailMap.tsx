import { useRef, useEffect, useMemo } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

interface Props {
  lat?: number;
  lng?: number;
  variation?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type L = any;

let leafletLoading: Promise<L> | null = null;

function loadLeaflet(): Promise<L> {
  if ((window as unknown as Record<string, unknown>).L) {
    return Promise.resolve((window as unknown as Record<string, unknown>).L);
  }
  if (leafletLoading) return leafletLoading;

  leafletLoading = new Promise((resolve, reject) => {
    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => {
      const lib = (window as unknown as Record<string, unknown>).L;
      if (lib) resolve(lib);
      else reject(new Error('Leaflet failed to load'));
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return leafletLoading;
}

function getMapColor(): string {
  try {
    const val = getComputedStyle(document.documentElement).getPropertyValue('--rs-primary').trim();
    if (val) return val;
  } catch { /* unavailable */ }
  return '#2563eb';
}

function addTileLayer(Leaflet: L, map: L) {
  Leaflet.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 20,
    subdomains: 'abcd',
  }).addTo(map);
}

async function fetchBoundary(query: string): Promise<L | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&polygon_geojson=1&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const data = await res.json();
    if (data?.[0]?.geojson) return data[0].geojson;
  } catch { /* boundary unavailable */ }
  return null;
}

function createThemedIcon(Leaflet: L, color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40"><path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.268 21.732 0 14 0z" fill="${color}"/><circle cx="14" cy="14" r="6" fill="#fff"/></svg>`;
  return Leaflet.divIcon({
    html: svg,
    className: '',
    iconSize: [28, 40],
    iconAnchor: [14, 40],
    popupAnchor: [0, -40],
  });
}

// Variation 0: Pin + approximate circle (hides exact location)
async function renderPinCircle(Leaflet: L, el: HTMLElement, lat: number, lng: number) {
  const color = getMapColor();
  const map = Leaflet.map(el).setView([lat, lng], 15);
  addTileLayer(Leaflet, map);
  Leaflet.circle([lat, lng], {
    radius: 200,
    color,
    fillColor: color,
    fillOpacity: 0.12,
    weight: 2,
  }).addTo(map);
  Leaflet.marker([lat, lng], { icon: createThemedIcon(Leaflet, color) }).addTo(map);
  return map;
}

// Variation 1: Zip code — geocode center + approximate circle
async function renderZipBoundary(Leaflet: L, el: HTMLElement, zipCode: string, _countryHint?: string) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(zipCode)}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const data = await res.json();
    if (!data?.[0]?.lat || !data?.[0]?.lon) return null;

    const result = data[0];
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);

    const color = getMapColor();
    const map = Leaflet.map(el).setView([lat, lng], 15);
    addTileLayer(Leaflet, map);
    Leaflet.circle([lat, lng], {
      radius: 200,
      color,
      fillColor: color,
      fillOpacity: 0.12,
      weight: 2,
      dashArray: '6 4',
    }).addTo(map);
    return map;
  } catch { /* geocoding unavailable */ }
  return null;
}

// Variation 2: Location/municipality boundary polygon
async function renderLocationBoundary(Leaflet: L, el: HTMLElement, locationName: string) {
  const geojson = await fetchBoundary(locationName);

  if (!geojson) return null;

  const color = getMapColor();
  const map = Leaflet.map(el);
  addTileLayer(Leaflet, map);
  const layer = Leaflet.geoJSON(geojson, {
    style: {
      color,
      fillColor: color,
      fillOpacity: 0.08,
      weight: 2.5,
      dashArray: '6 4',
    },
  }).addTo(map);
  map.fitBounds(layer.getBounds(), { padding: [30, 30] });
  return map;
}

export default function RsDetailMap({ lat: latProp, lng: lngProp, variation }: Props) {
  const { t } = useLabels();
  const config = useConfig();
  const property = useSelector(selectors.getSelectedProperty);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L>(null);

  const lat = latProp ?? property?.lat;
  const lng = lngProp ?? property?.lng;
  const zipCode = property?.zipCode;
  const locationName = property?.location?.name;

  // Resolve variation: prop (from data-spm-variation) > config (from dashboard) > auto
  const configVariation = config.mapVariation && config.mapVariation !== 'auto'
    ? Number(config.mapVariation) : undefined;
  const resolvedVariation = variation ?? configVariation;

  // Determine effective variation:
  // undefined = auto-detect by data priority. 0/1/2 = explicit override (prop or config).
  const effectiveVariation = useMemo(() => {
    if (resolvedVariation != null) return resolvedVariation;
    // Auto priority: lat/lng → 0, zipCode → 1, location → 2
    if (lat != null && lng != null) return 0;
    if (zipCode) return 1;
    if (locationName) return 2;
    return -1; // no data at all
  }, [resolvedVariation, lat, lng, zipCode, locationName]);

  useEffect(() => {
    if (effectiveVariation === -1 || !mapRef.current) return;
    const el = mapRef.current;
    let cancelled = false;

    loadLeaflet().then(async (Leaflet) => {
      if (cancelled || !el.isConnected) return;

      let map: L = null;

      if (effectiveVariation === 0 && lat != null && lng != null) {
        map = await renderPinCircle(Leaflet, el, lat, lng);
      } else if (effectiveVariation === 1 && zipCode) {
        map = await renderZipBoundary(Leaflet, el, zipCode, property?.location?.name);
        // Fallback to location if zip boundary not found
        if (!map && locationName) {
          map = await renderLocationBoundary(Leaflet, el, locationName);
        }
      } else if (effectiveVariation === 2 && locationName) {
        map = await renderLocationBoundary(Leaflet, el, locationName);
      }

      // Final fallback: if forced variation has no data, try next available
      if (!map) {
        if (lat != null && lng != null) {
          map = await renderPinCircle(Leaflet, el, lat, lng);
        } else if (zipCode) {
          map = await renderZipBoundary(Leaflet, el, zipCode, locationName);
        } else if (locationName) {
          map = await renderLocationBoundary(Leaflet, el, locationName);
        }
      }

      if (map && !cancelled) {
        mapInstance.current = map;
      }
    }).catch(() => {});

    return () => {
      cancelled = true;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [effectiveVariation, lat, lng, zipCode, locationName]);

  // Show nothing only if absolutely no geo data
  if (effectiveVariation === -1) {
    return null;
  }

  return (
    <div class="rs-detail-section">
      <h2 class="rs-detail-section__heading">
        {t('detail_location', 'Location')}
      </h2>
      <div
        ref={mapRef}
        class="rs-detail-map"
        style="height: 350px; border-radius: 8px; overflow: hidden;"
      />
    </div>
  );
}
