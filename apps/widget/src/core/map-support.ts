// Shared by the search map and the detail map.

import type { WidgetConfig } from '@/types';

const LEAFLET_VERSION = '1.9.4';
// unpkg first, jsDelivr if unpkg is down or blocked.
const LEAFLET_CDNS = [
  `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist`,
  `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist`,
];

let leafletPromise: Promise<any> | null = null;

export function loadLeaflet(): Promise<any> {
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = (async () => {
    let lastError: unknown;
    for (const base of LEAFLET_CDNS) {
      try {
        if (!document.querySelector(`link[data-spm-leaflet]`)) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = `${base}/leaflet.css`;
          link.setAttribute('data-spm-leaflet', '');
          document.head.appendChild(link);
        }
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = `${base}/leaflet.js`;
          script.onload = () => resolve();
          script.onerror = () => {
            script.remove();
            document.querySelector('link[data-spm-leaflet]')?.remove();
            reject(new Error(`Leaflet failed to load from ${base}`));
          };
          document.head.appendChild(script);
        });
        if ((window as any).L) return (window as any).L;
      } catch (err) {
        lastError = err;
      }
    }
    leafletPromise = null;
    throw lastError ?? new Error('Leaflet unavailable');
  })();
  return leafletPromise;
}

export interface MapTileSettings {
  provider?: 'osm' | 'maptiler' | 'custom';
  key?: string;
  url?: string;
  attribution?: string;
}

const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Map background. OpenStreetMap needs no key and is the default. CARTO's
// basemaps, used before, now draw "API KEY REQUIRED" over every tile.
export function tileLayerOptions(config: Pick<WidgetConfig, 'mapTiles'>): { url: string; options: Record<string, unknown> } {
  const tiles = (config.mapTiles || {}) as MapTileSettings;
  if (tiles.provider === 'maptiler' && tiles.key) {
    return {
      url: `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=${encodeURIComponent(tiles.key)}`,
      options: {
        attribution: '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> ' + OSM_ATTRIBUTION,
        maxZoom: 20,
      },
    };
  }
  if (tiles.provider === 'custom' && tiles.url && /^https:\/\//.test(tiles.url)) {
    return { url: tiles.url, options: { attribution: tiles.attribution || OSM_ATTRIBUTION, maxZoom: 20 } };
  }
  return { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', options: { attribution: OSM_ATTRIBUTION, maxZoom: 19 } };
}

// The API sends coordinates as decimal strings ("36.5099000"); anything used
// in arithmetic must be a number first.
export function toCoord(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

// Marker popups are HTML strings; listing text comes from feeds.
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// "€1.25M" / "£850K" from an already formatted price ("€1,250,000"): keeps the
// visitor's currency symbol and conversion from formatPrice.
export function shortPrice(formatted: string, amount: number | null): string {
  if (amount == null || !Number.isFinite(amount)) return formatted;
  const symbol = formatted.replace(/[\d.,\s\u00a0]/g, '') || '';
  const digits = Number(formatted.replace(/[^\d]/g, '')) || amount;
  // "1.50" -> "1.5", "2.00" -> "2"; whole numbers ("350") are left alone.
  const trim = (n: number) => (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  let body: string;
  if (digits >= 1_000_000) body = `${trim(digits / 1_000_000)}M`;
  else if (digits >= 1_000) body = `${trim(digits / 1_000)}K`;
  else body = String(digits);
  // Currency codes ("EUR") go after, symbols before.
  return /^[A-Z]{3}$/.test(symbol) ? `${body} ${symbol}` : `${symbol}${body}`;
}
