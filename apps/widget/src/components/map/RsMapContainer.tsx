import { useRef, useEffect, useState, useCallback } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import { actions } from '@/core/actions';
import { useCurrency } from '@/hooks/useCurrency';
import type { Property } from '@/types';

interface RsMapContainerProps {
  zoom?: number;
  center?: string;
  mode?: string;
}

interface MarkerGroup {
  lat: number;
  lng: number;
  properties: Property[];
  locationName?: string;
}

const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const DEBOUNCE_MS = 300;
const DEFAULT_CENTER: [number, number] = [40.0, -3.7];
const CLUSTER_THRESHOLD = 14;
const EXPLORE_CLUSTER_THRESHOLD = 13;

function shortPrice(amount: number, currency?: string): string {
  const sym = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : '€';
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return `${sym}${m % 1 === 0 ? m.toFixed(0) : m.toFixed(m >= 10 ? 1 : 2)}M`;
  }
  if (amount >= 1_000) {
    const k = amount / 1_000;
    return `${sym}${k % 1 === 0 ? k.toFixed(0) : k.toFixed(0)}K`;
  }
  return `${sym}${amount}`;
}

function clusterCircleSize(count: number, maxCount: number): number {
  const MIN = 36;
  const MAX = 72;
  if (maxCount <= 1) return MIN;
  const ratio = Math.log(count + 1) / Math.log(maxCount + 1);
  return Math.round(MIN + (MAX - MIN) * ratio);
}

function loadLeaflet(): Promise<any> {
  if ((window as any).L) return Promise.resolve((window as any).L);
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    if (document.querySelector(`script[src="${LEAFLET_JS}"]`)) {
      const check = setInterval(() => {
        if ((window as any).L) { clearInterval(check); resolve((window as any).L); }
      }, 50);
      return;
    }
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.onload = () => resolve((window as any).L);
    script.onerror = () => reject(new Error('Failed to load Leaflet'));
    document.head.appendChild(script);
  });
}

export default function RsMapContainer({ zoom: rawZoom = 10, center, mode: rawMode }: RsMapContainerProps) {
  const isExplore = rawMode === 'explore';
  const zoom = typeof rawZoom === 'string' ? parseInt(rawZoom, 10) || 10 : rawZoom;
  const { t } = useLabels();
  const { formatPrice } = useCurrency();
  const config = useSelector(selectors.getConfig);
  const results = useSelector(selectors.getResults);
  const locations = useSelector(selectors.getLocations);

  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didAutoFitRef = useRef(false);

  const [leafletReady, setLeafletReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(zoom);

  // Explore mode: independently fetched full dataset
  const [exploreData, setExploreData] = useState<Property[]>([]);
  const [exploreLoading, setExploreLoading] = useState(false);

  const properties = isExplore ? exploreData : (results?.data ?? []);

  const parsedCenter: [number, number] = (() => {
    if (center) {
      const parts = center.split(',').map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return [parts[0], parts[1]];
      }
    }
    return DEFAULT_CENTER;
  })();

  // ── Fetch all properties for explore mode ──
  useEffect(() => {
    if (!isExplore || !leafletReady) return;

    let cancelled = false;
    (async () => {
      setExploreLoading(true);
      try {
        const apiUrl = (config.apiUrl || '').replace(/\/$/, '');
        const url = new URL(`${apiUrl}/api/v1/properties`);
        url.searchParams.set('limit', '5000');

        const res = await fetch(url.toString(), {
          headers: { 'X-API-Key': config.apiKey || '' },
        });
        const json = await res.json();
        const unwrapped = json.data !== undefined ? json.data : json;
        const props: Property[] = Array.isArray(unwrapped) ? unwrapped : (unwrapped.data || []);
        if (!cancelled) setExploreData(props);
      } catch {
        if (!cancelled) setExploreData(results?.data ?? []);
      } finally {
        if (!cancelled) setExploreLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isExplore, leafletReady, config.apiUrl, config.apiKey]);

  // ── Default mode: bounds-based search on pan ──
  const handleMoveEnd = useCallback(() => {
    if (isExplore) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const map = mapRef.current;
      if (!map) return;
      const b = map.getBounds();
      const boundsStr = [
        b.getSouthWest().lat,
        b.getSouthWest().lng,
        b.getNorthEast().lat,
        b.getNorthEast().lng,
      ].join(',');
      actions.mergeFilters({ bounds: boundsStr });
      window.RealtySoft?.search();
    }, DEBOUNCE_MS);
  }, [isExplore]);

  // ── 3-tier coordinate resolver ──
  const resolveCoords = useCallback(
    (prop: Property): { lat: number; lng: number; tier: 1 | 2 | 3 } | null => {
      if (prop.lat != null && prop.lng != null) {
        return { lat: prop.lat, lng: prop.lng, tier: 1 };
      }
      if (prop.zipCode) return null;
      const loc = locations.find((l) => l.id === prop.location.id);
      if (loc?.lat != null && loc?.lng != null) {
        return { lat: loc.lat, lng: loc.lng, tier: 3 };
      }
      return null;
    },
    [locations],
  );

  // ── Default mode: pixel-based clustering ──
  const getMarkerGroups = useCallback(
    (props: Property[], zoomLevel: number): MarkerGroup[] => {
      const resolved: { prop: Property; lat: number; lng: number }[] = [];

      const zipGroups = new Map<string, Property[]>();
      for (const p of props) {
        if (p.lat != null && p.lng != null) continue;
        if (!p.zipCode) continue;
        if (!zipGroups.has(p.zipCode)) zipGroups.set(p.zipCode, []);
        zipGroups.get(p.zipCode)!.push(p);
      }

      for (const [, zipProps] of zipGroups) {
        let centerLat = 0, centerLng = 0, found = false;
        const loc = locations.find((l) => l.id === zipProps[0].location.id);
        if (loc?.lat != null && loc?.lng != null) {
          centerLat = loc.lat;
          centerLng = loc.lng;
          found = true;
        }
        if (!found) continue;

        const circleRadius = 0.003;
        for (let i = 0; i < zipProps.length; i++) {
          const angle = (2 * Math.PI * i) / zipProps.length - Math.PI / 2;
          const r = zipProps.length === 1 ? 0 : circleRadius;
          resolved.push({
            prop: zipProps[i],
            lat: centerLat + r * Math.sin(angle),
            lng: centerLng + r * Math.cos(angle),
          });
        }
      }

      for (const p of props) {
        if (p.zipCode && p.lat == null) continue;
        const coords = resolveCoords(p);
        if (coords) resolved.push({ prop: p, lat: coords.lat, lng: coords.lng });
      }

      if (resolved.length === 0) return [];

      if (zoomLevel >= CLUSTER_THRESHOLD) {
        return resolved.map((r) => ({ lat: r.lat, lng: r.lng, properties: [r.prop] }));
      }

      const pixelRadius = 60;
      const degreesPerPixel = 360 / (256 * Math.pow(2, zoomLevel));
      const threshold = pixelRadius * degreesPerPixel;

      const groups: MarkerGroup[] = [];
      const used = new Set<number>();

      for (let i = 0; i < resolved.length; i++) {
        if (used.has(i)) continue;
        const cluster = [resolved[i]];
        used.add(i);
        for (let j = i + 1; j < resolved.length; j++) {
          if (used.has(j)) continue;
          if (
            Math.abs(resolved[i].lat - resolved[j].lat) < threshold &&
            Math.abs(resolved[i].lng - resolved[j].lng) < threshold
          ) {
            cluster.push(resolved[j]);
            used.add(j);
          }
        }
        const avgLat = cluster.reduce((s, r) => s + r.lat, 0) / cluster.length;
        const avgLng = cluster.reduce((s, r) => s + r.lng, 0) / cluster.length;
        groups.push({ lat: avgLat, lng: avgLng, properties: cluster.map((r) => r.prop) });
      }
      return groups;
    },
    [resolveCoords, locations],
  );

  // ── Explore mode: location-based clustering at low zoom, individuals at high zoom ──
  const getExploreGroups = useCallback(
    (props: Property[], zoomLevel: number): MarkerGroup[] => {
      if (zoomLevel >= EXPLORE_CLUSTER_THRESHOLD) {
        return getMarkerGroups(props, zoomLevel);
      }

      const locMap = new Map<number, { props: Property[]; name: string }>();
      for (const p of props) {
        const locId = p.location.id;
        if (!locMap.has(locId)) {
          locMap.set(locId, { props: [], name: p.location.name });
        }
        locMap.get(locId)!.props.push(p);
      }

      const groups: MarkerGroup[] = [];
      for (const [locId, { props: locProps, name }] of locMap) {
        const loc = locations.find((l) => l.id === locId);
        if (loc?.lat == null || loc?.lng == null) continue;
        groups.push({
          lat: loc.lat,
          lng: loc.lng,
          properties: locProps,
          locationName: name,
        });
      }
      return groups;
    },
    [locations, getMarkerGroups],
  );

  // ── Init map ──
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const L = await loadLeaflet();
        if (cancelled || !mapElRef.current) return;

        leafletRef.current = L;
        const map = L.map(mapElRef.current).setView(parsedCenter, zoom);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap',
          maxZoom: 19,
        }).addTo(map);

        map.on('moveend', handleMoveEnd);

        mapRef.current = map;
        setLeafletReady(true);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (mapRef.current) {
        mapRef.current.off('moveend', handleMoveEnd);
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // ── Render markers ──
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || !leafletReady) return;

    for (const m of markersRef.current) {
      map.removeLayer(m);
    }
    markersRef.current = [];

    const groups = isExplore
      ? getExploreGroups(properties, currentZoom)
      : getMarkerGroups(properties, currentZoom);

    const maxCount = Math.max(...groups.map((g) => g.properties.length), 1);

    for (const group of groups) {
      if (group.properties.length === 1) {
        // ── Single property: price pill ──
        const prop = group.properties[0];
        const markerLabel = prop.priceOnRequest
          ? t('price_on_request', 'P.O.R.')
          : shortPrice(prop.price, prop.currency);
        const fullPrice = prop.priceOnRequest
          ? t('price_on_request', 'Price on Request')
          : formatPrice(prop.price, prop.currency);

        const icon = L.divIcon({
          className: '',
          html: `<div style="background:var(--rs-primary,#2563eb);color:#fff;font-size:11px;font-weight:600;padding:3px 8px;border-radius:20px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.25);text-align:center;cursor:pointer;">${markerLabel}</div>`,
          iconSize: [70, 26],
          iconAnchor: [35, 26],
        });

        const marker = L.marker([group.lat, group.lng], { icon }).addTo(map);

        const img = prop.images.length > 0
          ? prop.images.sort((a: any, b: any) => a.order - b.order)[0]
          : null;

        const detailUrl = config.propertyPageUrl
          ? `${config.propertyPageUrl}?id=${prop.id}&ref=${prop.reference}`
          : config.propertyPageSlug
            ? `/${config.propertyPageSlug}/${prop.reference}`
            : '#';

        const specs: string[] = [];
        if (prop.bedrooms) specs.push(`${prop.bedrooms} bed`);
        if (prop.bathrooms) specs.push(`${prop.bathrooms} bath`);
        if (prop.buildSize) specs.push(`${prop.buildSize} m²`);

        const popupHtml = `
          <div class="rs-map-popup">
            ${img ? `<img src="${img.thumbnailUrl || img.url}" alt="${prop.title}" />` : ''}
            <div class="rs-map-popup__body">
              <div class="rs-map-popup__price">${fullPrice}</div>
              <div class="rs-map-popup__title">${prop.title}</div>
              <div class="rs-map-popup__location">${prop.location.name}</div>
              ${specs.length ? `<div class="rs-map-popup__specs">${specs.join(' · ')}</div>` : ''}
              <a href="${detailUrl}" class="rs-map-popup__btn">${t('card_view_details', 'View Property')}</a>
            </div>
          </div>
        `;
        marker.bindPopup(popupHtml, { className: 'rs-map-popup-wrapper', maxWidth: 280 });

        marker.on('mouseover', () => {
          actions.mergeUI({ highlightedPropertyId: prop.id });
        });
        marker.on('mouseout', () => {
          actions.mergeUI({ highlightedPropertyId: null });
        });

        markersRef.current.push(marker);
      } else if (isExplore && currentZoom < EXPLORE_CLUSTER_THRESHOLD) {
        // ── Explore mode: proportionally-sized location cluster ──
        const count = group.properties.length;
        const size = clusterCircleSize(count, maxCount);
        const fontSize = Math.round(11 + (size - 36) * 0.25);

        const icon = L.divIcon({
          className: '',
          html: `<div style="
            background:var(--rs-primary,#2563eb);
            color:#fff;
            width:${size}px;
            height:${size}px;
            border-radius:50%;
            display:flex;
            align-items:center;
            justify-content:center;
            font-size:${fontSize}px;
            font-weight:700;
            box-shadow:0 3px 10px rgba(0,0,0,0.3);
            border:3px solid rgba(255,255,255,0.9);
            cursor:pointer;
            transition:transform 0.15s ease;
          "><span>${count}</span></div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });

        const marker = L.marker([group.lat, group.lng], { icon }).addTo(map);

        if (group.locationName) {
          marker.bindTooltip(group.locationName, {
            direction: 'bottom',
            offset: [0, size / 2 + 4],
            className: 'rs-map-cluster-tooltip',
          });
        }

        marker.on('click', () => {
          map.setView([group.lat, group.lng], Math.min(map.getZoom() + 3, 18));
        });

        markersRef.current.push(marker);
      } else {
        // ── Default cluster circle ──
        const icon = L.divIcon({
          className: '',
          html: `<div style="background:var(--rs-primary,#2563eb);color:#fff;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.25);border:3px solid rgba(255,255,255,0.8);cursor:pointer;"><span>${group.properties.length}</span></div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });

        const marker = L.marker([group.lat, group.lng], { icon }).addTo(map);

        marker.on('click', () => {
          map.setView([group.lat, group.lng], Math.min(map.getZoom() + 3, 18));
        });

        markersRef.current.push(marker);
      }
    }

    if (!didAutoFitRef.current && !center && groups.length > 0) {
      didAutoFitRef.current = true;
      const pts = groups.map((g) => [g.lat, g.lng] as [number, number]);
      map.fitBounds(L.latLngBounds(pts), {
        padding: [40, 40],
        maxZoom: isExplore ? 12 : 14,
      });
    }
  }, [properties, leafletReady, currentZoom, center, isExplore, getMarkerGroups, getExploreGroups, t, formatPrice]);

  // ── Track zoom ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !leafletReady) return;

    const onZoom = () => {
      setCurrentZoom(map.getZoom());
    };

    map.on('zoomend', onZoom);
    return () => {
      map.off('zoomend', onZoom);
    };
  }, [leafletReady]);

  // ── Explore stats ──
  const exploreStats = isExplore && exploreData.length > 0
    ? {
        areas: new Set(exploreData.map((p) => p.location.id)).size,
        total: exploreData.length,
      }
    : null;

  if (loadError) {
    return (
      <div class="rs-map-container rs-map-container--placeholder">
        <div class="rs-map-container__fallback">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <p>{t('map_unavailable', 'Map could not be loaded')}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      class={`rs-map-container${isExplore ? ' rs-map-container--explore' : ''}`}
      data-spw-cluster-threshold={CLUSTER_THRESHOLD}
    >
      {(!leafletReady || (isExplore && exploreLoading)) && (
        <div class="rs-map-container__loading">
          <span>{t('loading', 'Loading...')}</span>
        </div>
      )}
      <div ref={mapElRef} class="rs-map-container__canvas" />

      {exploreStats && (
        <div class="rs-map-explore-stats">
          <div class="rs-map-explore-stats__info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span>
              {exploreStats.areas} {t('zones', 'areas')} &middot; {exploreStats.total} {t('properties', 'properties')}
            </span>
          </div>
          <a
            href={config.resultsPage || 'search-listing.html'}
            class="rs-map-explore-stats__btn"
          >
            {t('view_all', 'View All Properties')}
          </a>
        </div>
      )}
    </div>
  );
}
