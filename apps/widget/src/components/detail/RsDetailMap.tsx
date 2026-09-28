import { useRef, useEffect, useMemo, useState } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import { getDataLoader, type LocationOutline } from '@/core/data-loader';
import { loadLeaflet, tileLayerOptions, toCoord } from '@/core/map-support';

interface Props {
  lat?: number;
  lng?: number;
  variation?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type L = any;

function getMapColor(): string {
  try {
    const val = getComputedStyle(document.documentElement).getPropertyValue('--rs-primary').trim();
    if (val) return val;
  } catch { /* unavailable */ }
  return '#2563eb';
}

let tileConfig: Parameters<typeof tileLayerOptions>[0] = {};

function addTileLayer(Leaflet: L, map: L) {
  const tiles = tileLayerOptions(tileConfig);
  Leaflet.tileLayer(tiles.url, tiles.options).addTo(map);
}

// How wide "somewhere in here" is, when we know the place but not its shape.
const RADIUS_BY_LEVEL_M: Record<string, number> = {
  urbanization: 900,
  town: 2500,
  municipality: 5000,
  area: 9000,
  province: 25000,
  region: 60000,
};

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
  const map = Leaflet.map(el, { scrollWheelZoom: false }).setView([lat, lng], 15);
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
    const map = Leaflet.map(el, { scrollWheelZoom: false }).setView([lat, lng], 15);
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

/**
 * Variation 2: the town the property is in, highlighted.
 *
 * The outline comes from the API, where it was geocoded with the town's
 * parents for context and checked against them. Asking OpenStreetMap from the
 * browser for a bare name — which this used to do, on every page view — drew
 * "Los Alamos" as a village 275 km away in Almería, and asked every visitor's
 * browser to do it again.
 *
 * With no outline stored we still know roughly where the place is, so the map
 * shows a dashed circle the size of that kind of place: vague on purpose,
 * because vague is the truth.
 */
async function renderTown(
  Leaflet: L,
  el: HTMLElement,
  outline: LocationOutline,
  pin: { lat: number; lng: number } | null,
) {
  const color = getMapColor();
  const lat = toCoord(outline.lat);
  const lng = toCoord(outline.lng);
  if (lat == null || lng == null) return null;

  const map = Leaflet.map(el, { scrollWheelZoom: false }).setView([lat, lng], 12);
  addTileLayer(Leaflet, map);

  let shape: L = null;
  // The town's own shape if we have it; otherwise the municipality it belongs
  // to, which says where the property is far better than a circle drawn around
  // a point — and, being an administrative boundary, it follows the coastline.
  const drawable = outline.boundary ?? outline.fence;
  if (drawable) {
    shape = Leaflet.geoJSON(drawable as never, {
      style: { className: 'rs-detail-map-area', weight: 2.5, fillOpacity: 0.08, dashArray: '6 4' },
      interactive: false,
    }).addTo(map);
  } else {
    shape = Leaflet.circle([lat, lng], {
      radius: RADIUS_BY_LEVEL_M[outline.level] ?? 2500,
      color,
      fillColor: color,
      fillOpacity: 0.08,
      weight: 2,
      dashArray: '6 4',
      interactive: false,
    }).addTo(map);
  }

  if (pin) Leaflet.marker([pin.lat, pin.lng], { icon: createThemedIcon(Leaflet, color) }).addTo(map);

  const bounds = shape?.getBounds?.();
  if (bounds?.isValid?.()) map.fitBounds(bounds, { padding: [30, 30] });
  return map;
}

export default function RsDetailMap({ lat: latProp, lng: lngProp, variation }: Props) {
  const { t } = useLabels();
  const config = useConfig();
  const property = useSelector(selectors.getSelectedProperty);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L>(null);

  // The API sends coordinates as decimal strings.
  const lat = toCoord(latProp ?? property?.lat) ?? undefined;
  const lng = toCoord(lngProp ?? property?.lng) ?? undefined;
  tileConfig = config;
  const zipCode = property?.zipCode;
  const locationId = property?.location?.id;
  const locationName = property?.location?.name;

  // The town's own outline, from the API. Cached per location, so several
  // properties in the same town cost one request.
  const [outline, setOutline] = useState<LocationOutline | null>(null);
  const [outlineTried, setOutlineTried] = useState(false);
  useEffect(() => {
    const loader = getDataLoader();
    if (!loader || !locationId) {
      setOutline(null);
      setOutlineTried(true);
      return;
    }
    let cancelled = false;
    setOutlineTried(false);
    loader.getLocationOutline(locationId).then((found) => {
      if (cancelled) return;
      setOutline(found);
      setOutlineTried(true);
    });
    return () => {
      cancelled = true;
    };
  }, [locationId]);

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
    if (locationId || locationName) return 2;
    return -1; // no data at all
  }, [resolvedVariation, lat, lng, zipCode, locationId, locationName]);

  useEffect(() => {
    if (effectiveVariation === -1 || !mapRef.current) return;
    // Wait for the town's outline before drawing anything that might use it.
    if (effectiveVariation === 2 && !outlineTried) return;
    const el = mapRef.current;
    let cancelled = false;

    loadLeaflet().then(async (Leaflet) => {
      if (cancelled || !el.isConnected) return;

      let map: L = null;
      const pin = lat != null && lng != null ? { lat, lng } : null;

      if (effectiveVariation === 0 && pin) {
        map = await renderPinCircle(Leaflet, el, pin.lat, pin.lng);
      } else if (effectiveVariation === 1 && zipCode) {
        map = await renderZipBoundary(Leaflet, el, zipCode, locationName);
        // Fall back to the town if the postcode could not be placed.
        if (!map && outline) map = await renderTown(Leaflet, el, outline, pin);
      } else if (effectiveVariation === 2 && outline) {
        map = await renderTown(Leaflet, el, outline, pin);
      }

      // A forced variation with no data behind it: use whatever we do have.
      if (!map) {
        if (outline) map = await renderTown(Leaflet, el, outline, pin);
        else if (pin) map = await renderPinCircle(Leaflet, el, pin.lat, pin.lng);
        else if (zipCode) map = await renderZipBoundary(Leaflet, el, zipCode, locationName);
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
  }, [effectiveVariation, lat, lng, zipCode, locationName, outline, outlineTried]);

  // Show nothing only if absolutely no geo data
  if (effectiveVariation === -1) return null;
  // Nor if the town turned out to be unplaceable and there is nothing else.
  if (outlineTried && !outline && lat == null && !zipCode) return null;

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
      {outline && !lat && (
        <p class="rs-detail-map__note">
          {locationName
            ? `${locationName} — ${t('map_approximate_location', 'Approximate location')}`
            : t('map_approximate_location', 'Approximate location')}
        </p>
      )}
    </div>
  );
}
