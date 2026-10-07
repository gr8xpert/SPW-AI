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
import { formatPropertyPrice, hasPrice } from '@/core/property-display';

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
// From this zoom on, a pile of listings that share a town's point is laid out
// without being asked: one bubble is no use once the town fills the screen.
// High enough that neighbouring towns' rings don't overlap.
const SPREAD_ZOOM = 16;
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
        map.on('click', () => {
          map.scrollWheelZoom.enable();
          // A click on the map itself (not a marker) closes an opened town.
          setOpenPiles((current) => (current.size ? new Set() : current));
        });
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
    () => spreadOpenPiles(points, openPiles, currentZoom),
    [points, openPiles, currentZoom],
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
      const groups: Array<MarkerGroup & { px: { x: number; y: number }; laidOut?: boolean }> = [];
      for (const p of placedPoints) {
        const px = map.project([p.lat, p.lng], zoomLevel);
        // An opened town is already laid out to be read one by one.
        if (p.spread) {
          groups.push({ lat: p.lat, lng: p.lng, points: [p], px, laidOut: true });
          continue;
        }
        const hit = groups.find((g) => !g.laidOut && Math.abs(g.px.x - px.x) < CLUSTER_PX && Math.abs(g.px.y - px.y) < CLUSTER_PX);
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
        const priced = hasPrice(p);
        const full = formatPropertyPrice(p, (n) => formatPrice(n, p.currency), t, t('price_on_request', 'Price on request'));
        // The pin stays short: the "from" amount only.
        const label = priced ? shortPrice(formatPrice(p.price!, p.currency), p.price!) : t('map_price_on_request_short', 'P.O.R.');
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
        // listings are laid out in rings around the town's point, each with its
        // price, and the map centres on it. One town open at a time.
        if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
          setOpenPiles(new Set([pileKey(group.points[0])]));
          moveProgrammatically(() => map.setView(bounds.getCenter(), Math.max(currentZoom, 14)));
        } else {
          map.fitBounds(bounds, { padding: [48, 48], maxZoom: INDIVIDUAL_ZOOM });
        }
      });
    }
  }, [leafletReady, buildGroups, currentZoom, zonesMode, t, formatPrice, moveProgrammatically]);

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

export function pileKey(p: { lat: number; lng: number }): string {
  return `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
}

// A point laid out around its town's point, not at a position of its own.
export type PlacedPoint = MapPoint & { spread?: boolean };

// Layout of an opened town, in screen pixels: a honeycomb of label-sized cells
// (a price label is up to ~60 px wide and 24 px tall), filled from the middle
// outward, so the whole reads as a round patch around the town's point and no
// two prices overlap however many there are. Pixels rather than metres, so it
// looks the same at every zoom and stays centred on the town.
const CELL_W = 66;
const CELL_H = 30;

export function ringOffsetsPx(count: number): Array<[number, number]> {
  if (count <= 0) return [];
  // Enough rows and columns to hold `count` cells inside a circle.
  const reach = Math.ceil(Math.sqrt(count)) + 2;
  const cells: Array<[number, number, number]> = [];
  for (let row = -reach; row <= reach; row++) {
    // Every other row shifted half a cell: a honeycomb, not a grid.
    const shift = row % 2 ? CELL_W / 2 : 0;
    for (let col = -reach; col <= reach; col++) {
      const x = col * CELL_W + shift;
      const y = row * CELL_H;
      // The town's point itself stays clear: it is what the others are around.
      if (x === 0 && y === 0) continue;
      cells.push([x, y, Math.hypot(x, y)]);
    }
  }
  cells.sort((a, b) => a[2] - b[2] || Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
  return cells.slice(0, count).map(([x, y]) => [x, y]);
}

const byPrice = (a: MapPoint, b: MapPoint) => {
  const pa = a.priceOnRequest || a.price == null ? Infinity : a.price;
  const pb = b.priceOnRequest || b.price == null ? Infinity : b.price;
  return pa - pb || a.id - b.id;
};

/**
 * Listings placed where they can actually be drawn.
 *
 * Feed listings carry no address, so a town's listings all share the town's
 * point. That pile stays one bubble with its count until the visitor opens it
 * (or zooms right into the town); then its listings are laid out in rings
 * around the town's point, cheapest in the middle, so every price can be read
 * and clicked. Each one is still labelled an approximate location.
 */
export function spreadOpenPiles(points: MapPoint[], open: Set<string>, zoomLevel: number): PlacedPoint[] {
  const buckets = new Map<string, MapPoint[]>();
  for (const p of points) {
    const key = pileKey(p);
    const list = buckets.get(key);
    if (list) list.push(p);
    else buckets.set(key, [p]);
  }

  const out: PlacedPoint[] = [];
  for (const [key, list] of buckets) {
    const spread =
      list.length > 1 &&
      list.every((p) => p.approximate) &&
      (open.has(key) || zoomLevel >= SPREAD_ZOOM);
    if (!spread) {
      out.push(...list);
      continue;
    }
    const { lat, lng } = list[0];
    const cosLat = Math.cos((lat * Math.PI) / 180);
    // Web Mercator: metres per screen pixel at this latitude and zoom.
    const metresPerPx = (156543.03392 * cosLat) / 2 ** zoomLevel;
    const offsets = ringOffsetsPx(list.length);
    [...list].sort(byPrice).forEach((p, i) => {
      const [dx, dy] = offsets[i];
      out.push({
        ...p,
        lat: lat - (dy * metresPerPx) / METRES_PER_DEGREE,
        lng: lng + (dx * metresPerPx) / (METRES_PER_DEGREE * cosLat),
        spread: true,
      });
    });
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
