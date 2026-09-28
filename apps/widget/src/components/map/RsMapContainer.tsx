import { useRef, useEffect, useMemo, useState, useCallback } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { useCurrency } from '@/hooks/useCurrency';
import { useMapPoints } from '@/hooks/useMapPoints';
import { useMapAreas } from '@/hooks/useMapAreas';
import { selectors } from '@/core/selectors';
import { actions } from '@/core/actions';
import { buildPropertyUrl } from '@/core/url-utils';
import { escapeHtml, loadLeaflet, shortPrice, tileLayerOptions, toCoord } from '@/core/map-support';
import type { MapArea, MapPoint } from '@/core/data-loader';

interface RsMapContainerProps {
  zoom?: number | string;
  center?: string;
  // 'explore': every listing of the site, grouped by area until zoomed in.
  // 'zones': the current results grouped by area. Default: price markers.
  mode?: string;
  fitBounds?: string;
  // Offer "Search this area" after the visitor moves the map (needs a list
  // on the page to show the result). Off for map-only layouts.
  areaSearch?: boolean | string;
}

interface MarkerGroup {
  lat: number;
  lng: number;
  points: MapPoint[];
  label?: string;
}

const DEFAULT_CENTER: [number, number] = [40.0, -3.7];
// From this zoom on, every listing gets its own marker.
const INDIVIDUAL_ZOOM = 15;
// Explore/zones: area groups below this zoom.
const ZONE_ZOOM = 13;
// From this zoom on, a pile of listings that share a town's point is spread
// across that town without being asked: one bubble is no use once the town
// fills the screen.
const SPREAD_ZOOM = 14;
const CLUSTER_PX = 56;

export default function RsMapContainer({
  zoom: rawZoom = 10,
  center,
  mode: rawMode,
  fitBounds: fitBoundsProp,
  areaSearch = true,
}: RsMapContainerProps) {
  const isExplore = rawMode === 'explore';
  const zonesMode = rawMode === 'zones' || isExplore;
  const offerAreaSearch = !isExplore && areaSearch !== false && areaSearch !== 'false';
  const zoom = typeof rawZoom === 'string' ? parseInt(rawZoom, 10) || 10 : rawZoom;
  const { t } = useLabels();
  const { formatPrice } = useCurrency();
  const config = useSelector(selectors.getConfig);
  const filters = useSelector(selectors.getEffectiveFilters);
  const ui = useSelector(selectors.getUI);
  const { points, loading, error, truncated, version } = useMapPoints(isExplore ? 'all' : 'search');
  // The towns those listings are in, with their outlines: what the map can
  // honestly draw when a feed sends no coordinates per listing.
  const { areas } = useMapAreas(isExplore ? 'all' : 'search');
  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);

  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const outlineLayerRef = useRef<any>(null);
  const outlineById = useRef(new Map<number, any>());
  const radiusLayerRef = useRef<any>(null);
  const markerById = useRef(new Map<number, any>());
  const programmaticMove = useRef(false);
  const fittedVersion = useRef<string | null>(null);

  const [leafletReady, setLeafletReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(zoom);
  const [moved, setMoved] = useState(false);
  // Piles of same-point listings the visitor has opened. Feed listings have no
  // address, so a whole town's worth share one point; opening one spreads it
  // across the town it is actually in.
  const [openPiles, setOpenPiles] = useState<Set<string>>(() => new Set());

  const areaActive = !!filters.bounds;
  const radiusLat = toCoord(filters.lat);
  const radiusLng = toCoord(filters.lng);
  const radiusKm = toCoord(filters.radius);

  const initialCenter: [number, number] = (() => {
    const parts = (center || '').split(',').map(Number);
    return parts.length === 2 && parts.every(Number.isFinite) ? [parts[0], parts[1]] : DEFAULT_CENTER;
  })();

  // Map moves done by code (fitting results, following a radius search) must
  // not look like the visitor exploring.
  const moveProgrammatically = useCallback((fn: () => void) => {
    programmaticMove.current = true;
    fn();
    // Cleared by the move's own moveend; the timer covers a move that
    // turned out to be a no-op and never fires one.
    setTimeout(() => {
      programmaticMove.current = false;
    }, 1500);
  }, []);

  // ── Init ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const L = await loadLeaflet();
        if (cancelled || !mapElRef.current) return;
        leafletRef.current = L;
        const map = L.map(mapElRef.current, { scrollWheelZoom: false, zoomControl: true }).setView(initialCenter, zoom);
        const tiles = tileLayerOptions(config);
        L.tileLayer(tiles.url, tiles.options).addTo(map);
        // Under the markers: the town outlines are the backdrop the counts sit on.
        outlineLayerRef.current = L.layerGroup().addTo(map);
        layerRef.current = L.layerGroup().addTo(map);
        // Scroll-zoom only after the visitor clicks into the map, so scrolling
        // the page doesn't get stuck on it.
        map.once('focus', () => map.scrollWheelZoom.enable());
        map.on('click', () => map.scrollWheelZoom.enable());
        map.on('zoomend', () => setCurrentZoom(map.getZoom()));
        map.on('moveend', () => {
          if (programmaticMove.current) programmaticMove.current = false;
          else setMoved(true);
        });
        mapRef.current = map;
        setCurrentZoom(map.getZoom());
        setLeafletReady(true);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Listings that are only known to be "in this town" all sit on its point.
  // Once a pile is opened — or the map is zoomed into the town anyway — they
  // are spread across the place they belong to, each keeping the same spot on
  // every visit, and every one of them drawn as an approximate location.
  const placedPoints = useMemo(
    () => spreadOpenPiles(points, openPiles, currentZoom, areaById),
    [points, openPiles, currentZoom, areaById],
  );

  // ── Groups for the current zoom ──
  const buildGroups = useCallback(
    (zoomLevel: number): MarkerGroup[] => {
      const map = mapRef.current;
      if (!map) return [];
      if (zonesMode && zoomLevel < ZONE_ZOOM) {
        const byLocation = new Map<string, MarkerGroup>();
        for (const p of placedPoints) {
          const key = p.location ? String(p.location.id) : `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
          const g = byLocation.get(key);
          if (g) g.points.push(p);
          else byLocation.set(key, { lat: 0, lng: 0, points: [p], label: p.location?.name });
        }
        for (const g of byLocation.values()) {
          g.lat = g.points.reduce((s, p) => s + p.lat, 0) / g.points.length;
          g.lng = g.points.reduce((s, p) => s + p.lng, 0) / g.points.length;
        }
        return [...byLocation.values()];
      }
      if (zoomLevel >= INDIVIDUAL_ZOOM) return spreadOverlaps(placedPoints);
      // Screen-space clustering at this zoom.
      const groups: Array<MarkerGroup & { px: { x: number; y: number } }> = [];
      for (const p of placedPoints) {
        const px = map.project([p.lat, p.lng], zoomLevel);
        const hit = groups.find((g) => Math.abs(g.px.x - px.x) < CLUSTER_PX && Math.abs(g.px.y - px.y) < CLUSTER_PX);
        if (hit) hit.points.push(p);
        else groups.push({ lat: p.lat, lng: p.lng, points: [p], px });
      }
      return groups.map((g) => {
        if (g.points.length === 1) return g;
        // A cluster that is all one town can say so.
        const ids = new Set(g.points.map((p) => p.location?.id));
        return {
          lat: g.points.reduce((s, p) => s + p.lat, 0) / g.points.length,
          lng: g.points.reduce((s, p) => s + p.lng, 0) / g.points.length,
          points: g.points,
          label: ids.size === 1 ? g.points[0].location?.name : undefined,
        };
      });
    },
    [placedPoints, zonesMode],
  );

  // Zoom to a town: to its outline where we have one, otherwise to its point.
  const focusArea = useCallback((area: MapArea) => {
    const map = mapRef.current;
    if (!map) return;
    const shape = outlineById.current.get(area.id);
    if (shape) {
      moveProgrammatically(() => map.fitBounds(shape.getBounds(), { padding: [32, 32] }));
      shape.setStyle({ fillOpacity: 0.16 });
      setTimeout(() => shape.setStyle({ fillOpacity: 0.07 }), 1200);
      return;
    }
    moveProgrammatically(() => map.setView([area.lat, area.lng], Math.max(map.getZoom(), 12)));
  }, [moveProgrammatically]);

  // ── The towns, drawn ──
  // A listing from a feed has no coordinates of its own, so it can only be
  // placed in its town. Drawing the town says exactly that, where a pin in the
  // middle of it claims an address we do not have.
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    const layer = outlineLayerRef.current;
    if (!map || !L || !layer || !leafletReady) return;
    layer.clearLayers();
    outlineById.current.clear();

    for (const area of areas) {
      if (!area.boundary) continue;
      const shape = L.geoJSON(area.boundary as any, {
        style: { className: 'rs-map-area-shape', weight: 2, fillOpacity: 0.07, opacity: 0.85 },
      }).addTo(layer);
      shape.bindTooltip(`${escapeHtml(area.name)} · ${area.count}`, {
        direction: 'top',
        className: 'rs-map-cluster-tooltip',
        sticky: true,
      });
      shape.on('mouseover', () => shape.setStyle({ fillOpacity: 0.16 }));
      shape.on('mouseout', () => shape.setStyle({ fillOpacity: 0.07 }));
      shape.on('click', () => focusArea(area));
      outlineById.current.set(area.id, shape);
    }
  }, [areas, leafletReady]);

  // ── Draw markers ──
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    const layer = layerRef.current;
    if (!map || !L || !layer || !leafletReady) return;
    layer.clearLayers();
    markerById.current.clear();

    const groups = buildGroups(currentZoom);
    const maxCount = Math.max(1, ...groups.map((g) => g.points.length));

    for (const group of groups) {
      if (group.points.length === 1 && !(zonesMode && currentZoom < ZONE_ZOOM)) {
        const p = group.points[0];
        const full = p.priceOnRequest || p.price == null ? t('price_on_request', 'Price on request') : formatPrice(p.price, p.currency);
        const label = p.priceOnRequest || p.price == null ? t('map_price_on_request_short', 'P.O.R.') : shortPrice(full, p.price);
        const icon = L.divIcon({
          className: 'rs-map-marker-icon',
          html: `<div class="rs-map-marker${p.approximate ? ' rs-map-marker--approx' : ''}">${escapeHtml(label)}</div>`,
          iconSize: null,
          iconAnchor: [0, 0],
        });
        const marker = L.marker([group.lat, group.lng], { icon, riseOnHover: true, keyboard: true, title: p.title }).addTo(layer);
        marker.bindPopup(popupHtml(p, full), { className: 'rs-map-popup-wrapper', maxWidth: 280, minWidth: 240, autoPanPadding: [24, 24] });
        marker.on('mouseover', () => actions.mergeUI({ highlightedPropertyId: p.id }));
        marker.on('mouseout', () => actions.mergeUI({ highlightedPropertyId: null }));
        markerById.current.set(p.id, marker);
        continue;
      }

      const count = group.points.length;
      const zone = zonesMode && currentZoom < ZONE_ZOOM;
      const size = zone ? Math.round(38 + 34 * (Math.log(count + 1) / Math.log(maxCount + 1))) : count < 10 ? 38 : count < 100 ? 46 : 54;
      const icon = L.divIcon({
        className: 'rs-map-marker-icon',
        html: `<div class="rs-map-cluster${zone ? ' rs-map-cluster--zone' : ''}" style="width:${size}px;height:${size}px"><span>${count}</span></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      const marker = L.marker([group.lat, group.lng], { icon, keyboard: true, title: group.label ? `${group.label} (${count})` : String(count) }).addTo(layer);
      if (group.label) {
        marker.bindTooltip(escapeHtml(group.label), { direction: 'bottom', offset: [0, size / 2], className: 'rs-map-cluster-tooltip' });
      }
      marker.on('click', () => {
        const pts = group.points.map((pt) => [pt.lat, pt.lng]);
        const bounds = L.latLngBounds(pts);
        // Every listing here shares one point because none of them has an
        // address — zooming shows the same pile at every level. Open it: the
        // listings spread across the town they are in, each with its price, and
        // the map goes there.
        if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
          const key = pileKey(group.points[0]);
          const locationId = group.points[0].location?.id;
          const area = locationId != null ? areaById.get(locationId) : undefined;
          setOpenPiles((current) => new Set(current).add(key));
          const radius = spreadRadiusM(area);
          const zoom = radius <= 600 ? 16 : radius <= 1500 ? 15 : 14;
          moveProgrammatically(() => map.setView(bounds.getCenter(), Math.max(currentZoom, zoom)));
        } else {
          map.fitBounds(bounds, { padding: [48, 48], maxZoom: INDIVIDUAL_ZOOM });
        }
      });
    }
  }, [leafletReady, buildGroups, currentZoom, zonesMode, t, formatPrice, areaById, moveProgrammatically]);

  function popupHtml(p: MapPoint, price: string): string {
    const url = buildPropertyUrl({ id: p.id, reference: p.reference, title: p.title, urlSegment: p.urlSegment, slug: p.slug, location: p.location, propertyType: p.propertyType }, config) || '#';
    const specs: string[] = [];
    if (p.bedrooms) specs.push(`${p.bedrooms} ${t('card_bedrooms', 'Beds')}`);
    if (p.bathrooms) specs.push(`${p.bathrooms} ${t('card_bathrooms', 'Baths')}`);
    if (p.buildSize) specs.push(`${Math.round(p.buildSize)} m²`);
    return `
      <div class="rs-map-popup">
        ${p.image ? `<a href="${escapeHtml(url)}" class="rs-map-popup__image"><img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)}" loading="lazy" /></a>` : ''}
        <div class="rs-map-popup__body">
          <div class="rs-map-popup__price">${escapeHtml(price)}</div>
          <div class="rs-map-popup__title">${escapeHtml(p.title)}</div>
          ${p.location ? `<div class="rs-map-popup__location">${escapeHtml(p.location.name)}</div>` : ''}
          ${specs.length ? `<div class="rs-map-popup__specs">${escapeHtml(specs.join(' · '))}</div>` : ''}
          ${p.approximate ? `<div class="rs-map-popup__approx">${escapeHtml(t('map_approximate_location', 'Approximate location'))}</div>` : ''}
          <a href="${escapeHtml(url)}" class="rs-map-popup__btn">${escapeHtml(t('card_view_details', 'View property'))}</a>
        </div>
      </div>`;
  }

  // ── Highlight the marker of the card being hovered ──
  useEffect(() => {
    for (const [id, marker] of markerById.current) {
      const el = marker.getElement()?.querySelector('.rs-map-marker');
      if (!el) continue;
      const on = id === ui.highlightedPropertyId;
      el.classList.toggle('rs-map-marker--active', on);
      if (on) marker.setZIndexOffset(1000);
      else marker.setZIndexOffset(0);
    }
  }, [ui.highlightedPropertyId, currentZoom, points]);

  // ── Fit the map to a new set of results ──
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || !leafletReady || loading || !version || fittedVersion.current === version) return;
    fittedVersion.current = version;
    setMoved(false);
    if (radiusLat != null && radiusLng != null && radiusKm) return; // the radius circle decides
    if (!points.length) return;
    moveProgrammatically(() =>
      map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: zonesMode ? 12 : 14 }),
    );
  }, [version, loading, leafletReady]);

  // ── Radius search: circle + view ──
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || !leafletReady) return;
    radiusLayerRef.current?.remove();
    radiusLayerRef.current = null;
    if (radiusLat == null || radiusLng == null || !radiusKm) return;
    const circle = L.circle([radiusLat, radiusLng], {
      radius: radiusKm * 1000,
      className: 'rs-map-radius-circle',
      interactive: false,
    }).addTo(map);
    radiusLayerRef.current = circle;
    moveProgrammatically(() => map.fitBounds(circle.getBounds(), { padding: [24, 24] }));
  }, [radiusLat, radiusLng, radiusKm, leafletReady]);

  // ── External fitBounds (location chips): "timestamp:minLat,minLng,maxLat,maxLng" or "timestamp:" for all ──
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || !leafletReady || !fitBoundsProp) return;
    const boundsStr = fitBoundsProp.includes(':') ? fitBoundsProp.slice(fitBoundsProp.indexOf(':') + 1) : fitBoundsProp;
    if (!boundsStr) {
      if (points.length) map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 14 });
      return;
    }
    const parts = boundsStr.split(',').map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite) && parts.some((n) => n !== 0)) {
      map.fitBounds(L.latLngBounds([[parts[0], parts[1]], [parts[2], parts[3]]]), { padding: [40, 40], maxZoom: 16 });
    }
  }, [fitBoundsProp, leafletReady]);

  const searchThisArea = () => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    actions.mergeFilters({
      bounds: [b.getSouthWest().lat, b.getSouthWest().lng, b.getNorthEast().lat, b.getNorthEast().lng].map((n) => n.toFixed(6)).join(','),
      page: 1,
    });
    setMoved(false);
    window.RealtySoft?.search();
  };

  const clearArea = () => {
    actions.mergeFilters({ bounds: undefined, page: 1 });
    setMoved(false);
    window.RealtySoft?.search();
  };

  if (loadError) {
    return (
      <div class="rs-map-container rs-map-container--placeholder">
        <div class="rs-map-container__fallback">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <p>{t('map_unavailable', 'The map could not be loaded')}</p>
        </div>
      </div>
    );
  }

  const areaCount = isExplore ? (areas.length || new Set(points.map((p) => p.location?.id)).size) : 0;

  return (
    <div class={`rs-map-container${isExplore ? ' rs-map-container--explore' : ''}`}>
      <div ref={mapElRef} class="rs-map-container__canvas" />

      {(!leafletReady || loading) && (
        <div class="rs-map-container__loading" role="status">
          <span>{t('loading', 'Loading...')}</span>
        </div>
      )}

      {leafletReady && !loading && !error && points.length === 0 && (
        <div class="rs-map-container__notice" role="status">
          {t('map_no_results', 'No properties to show on the map for this search')}
        </div>
      )}
      {leafletReady && error && (
        <div class="rs-map-container__notice rs-map-container__notice--error" role="status">
          {t('map_load_error', 'Properties could not be loaded on the map')}
        </div>
      )}

      {offerAreaSearch && leafletReady && (moved || areaActive) && (
        <div class="rs-map-area-search">
          {moved && (
            <button type="button" class="rs-map-area-search__btn" onClick={searchThisArea}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              {t('map_search_this_area', 'Search this area')}
            </button>
          )}
          {!moved && areaActive && (
            <button type="button" class="rs-map-area-search__btn rs-map-area-search__btn--clear" onClick={clearArea}>
              {t('map_showing_area', 'Showing this area')} <span aria-hidden="true">×</span>
            </button>
          )}
        </div>
      )}

      {truncated && (
        <div class="rs-map-container__hint">{t('map_truncated', 'Zoom in or filter to see every property')}</div>
      )}

      {isExplore && points.length > 0 && (
        <div class="rs-map-explore-stats">
          <div class="rs-map-explore-stats__info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span>
              {areaCount} {t('zones', 'areas')} &middot; {points.length} {t('properties', 'properties')}
            </span>
          </div>
          <a href={config.resultsPage || '#'} class="rs-map-explore-stats__btn">
            {t('view_all', 'View all properties')}
          </a>
        </div>
      )}
    </div>
  );
}

// A handful of listings at one spot are fanned into a small ring so each keeps
// its own marker. Beyond that they stay one bubble with a count on it until
// the visitor opens it, or until the map is zoomed into the town anyway.
const FAN_MAX = 8;
// ~50 m at Spanish latitudes: far enough apart to click, close enough to stay
// on the right street.
const FAN_RADIUS = 0.00045;

const METRES_PER_DEGREE = 111320;

// How far across a pile may be spread, when all we know is the kind of place
// the listings are in. Used when we have no outline for it — which is most
// places: OpenStreetMap only has a shape for somewhere mapped as an area, and
// neighbourhoods like Torremuelle or Montemar are mapped as a single point.
const SPREAD_BY_LEVEL_M: Record<string, number> = {
  urbanization: 300,
  town: 600,
  municipality: 1200,
  area: 2500,
  province: 8000,
  region: 20000,
};

export function pileKey(p: { lat: number; lng: number }): string {
  return `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
}

function ringsOf(boundary: MapArea['boundary']): number[][][] {
  if (!boundary) return [];
  return boundary.type === 'Polygon'
    ? (boundary.coordinates as number[][][])
    : (boundary.coordinates as number[][][][]).flat();
}

// How far a pile may be spread around a town's point. What kind of place it is
// decides that — a listing we can only place by its town should look like it is
// in that town, not scattered over the coast — and the outline, where we have
// one, only ever makes it smaller, so a small place keeps a small spread.
export function spreadRadiusM(area: MapArea | undefined): number {
  let radius = SPREAD_BY_LEVEL_M[area?.level ?? ''] ?? 900;
  const rings = ringsOf(area?.boundary ?? null);
  if (rings.length) {
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const ring of rings) {
      for (const [lng, lat] of ring) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      }
    }
    const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
    const heightM = (maxLat - minLat) * METRES_PER_DEGREE;
    const widthM = (maxLng - minLng) * METRES_PER_DEGREE * Math.cos(midLat);
    const half = Math.min(heightM, widthM) / 2;
    if (half > 0) radius = Math.min(radius, half);
  }
  return Math.max(150, Math.min(radius, 2500));
}

function hash01(value: string): [number, number] {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const first = (h >>> 0) / 4294967296;
  const second = (Math.imul(h ^ 0x9e3779b9, 2654435761) >>> 0) / 4294967296;
  return [first, second];
}

// Is this spot inside the town? Ray casting against the outline's outer rings.
function insideOutline(lat: number, lng: number, rings: number[][][]): boolean {
  for (const ring of rings) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

// Each listing keeps the same spot on every visit — the offset comes from its
// reference, not from chance — and every one of them is drawn and labelled as
// an approximate location, because that is exactly what it is. Nothing here
// claims to be an address.
//
// Where we have the town's outline, a spot is tried until it lands inside it,
// so nothing is drawn in the sea or in the next village. Where we do not, the
// circle is deliberately small: a listing we can only place by its town should
// look like it is in the middle of that town, not scattered over the coast.
function spreadAcross(list: MapPoint[], radiusM: number, rings: number[][][]): MapPoint[] {
  const TRIES = 16;
  return list.map((p) => {
    const seed = p.reference || String(p.id);
    for (let attempt = 0; attempt < TRIES; attempt++) {
      const [u, v] = hash01(attempt ? `${seed}#${attempt}` : seed);
      const angle = 2 * Math.PI * u;
      // sqrt keeps them evenly spread over the circle instead of bunched middle.
      const radius = radiusM * Math.sqrt(v);
      const lat = p.lat + (radius * Math.sin(angle)) / METRES_PER_DEGREE;
      const lng = p.lng + (radius * Math.cos(angle)) / (METRES_PER_DEGREE * Math.cos((p.lat * Math.PI) / 180));
      if (!rings.length || insideOutline(lat, lng, rings)) return { ...p, lat, lng };
    }
    // Nowhere inside the place worked — a town point right on the shoreline,
    // say. Leave it on the point rather than drop it in the sea: it joins the
    // others there as a count, which is at least true.
    return p;
  });
}

/**
 * Listings placed where they can actually be drawn.
 *
 * A pile of listings sharing one point is left alone — one bubble with the
 * count — until either the visitor opens it or the map is zoomed into the town
 * anyway. Then it is spread across that town, so the prices can be read and
 * each marker opens its own property.
 */
export function spreadOpenPiles(
  points: MapPoint[],
  open: Set<string>,
  zoomLevel: number,
  areaById: Map<number, MapArea>,
): MapPoint[] {
  const buckets = new Map<string, MapPoint[]>();
  for (const p of points) {
    const key = pileKey(p);
    const list = buckets.get(key);
    if (list) list.push(p);
    else buckets.set(key, [p]);
  }

  const out: MapPoint[] = [];
  for (const [key, list] of buckets) {
    const spread =
      list.length > 1 &&
      list.every((p) => p.approximate) &&
      (open.has(key) || zoomLevel >= SPREAD_ZOOM);
    if (!spread) {
      out.push(...list);
      continue;
    }
    const locationId = list[0].location?.id;
    const area = locationId != null ? areaById.get(locationId) : undefined;
    // A bigger pile needs more room, or the markers sit on top of each other.
    const room = Math.min(3, Math.max(1, Math.sqrt(list.length) / 3));
    // Kept inside the town where we have its shape, and inside the
    // municipality — whose boundary follows the coastline — where we do not.
    const fence = ringsOf(area?.boundary ?? area?.fence ?? null);
    out.push(...spreadAcross(list, spreadRadiusM(area) * room, fence));
  }
  return out;
}

function fan(list: MapPoint[]): MarkerGroup[] {
  return list.map((p, i) => {
    const angle = (2 * Math.PI * i) / list.length - Math.PI / 2;
    return {
      lat: p.lat + FAN_RADIUS * Math.sin(angle),
      lng: p.lng + (FAN_RADIUS * Math.cos(angle)) / Math.cos((p.lat * Math.PI) / 180),
      points: [p],
    };
  });
}

function spreadOverlaps(points: MapPoint[]): MarkerGroup[] {
  const buckets = new Map<string, MapPoint[]>();
  for (const p of points) {
    const key = pileKey(p);
    const list = buckets.get(key);
    if (list) list.push(p);
    else buckets.set(key, [p]);
  }
  const out: MarkerGroup[] = [];
  for (const [, list] of buckets) {
    if (list.length === 1) {
      out.push({ lat: list[0].lat, lng: list[0].lng, points: list });
      continue;
    }
    // Still on one point at this zoom: a pile nobody has opened. Keep it as one
    // bubble, named after its town, rather than inventing streets for it.
    if (list.every((p) => p.approximate)) {
      out.push({ lat: list[0].lat, lng: list[0].lng, points: list, label: list[0].location?.name });
      continue;
    }
    // Listings with real coordinates that happen to coincide: a small ring is
    // honest enough, they are within 50 m of where they say they are.
    if (list.length <= FAN_MAX) out.push(...fan(list));
    else out.push({ lat: list[0].lat, lng: list[0].lng, points: list });
  }
  return out;
}
