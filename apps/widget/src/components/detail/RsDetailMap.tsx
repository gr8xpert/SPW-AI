import { useRef, useEffect } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

interface Props {
  lat?: number;
  lng?: number;
}

type LeafletMap = { setView: (c: [number, number], z: number) => LeafletMap; remove: () => void };
type LeafletStatic = {
  map: (el: HTMLElement) => LeafletMap;
  tileLayer: (url: string, opts: Record<string, unknown>) => { addTo: (m: unknown) => void };
  marker: (latlng: [number, number]) => { addTo: (m: unknown) => void };
};

let leafletLoading: Promise<LeafletStatic> | null = null;

function loadLeaflet(): Promise<LeafletStatic> {
  if ((window as unknown as Record<string, unknown>).L) {
    return Promise.resolve((window as unknown as Record<string, unknown>).L as LeafletStatic);
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
      const L = (window as unknown as Record<string, unknown>).L as LeafletStatic;
      if (L) resolve(L);
      else reject(new Error('Leaflet failed to load'));
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return leafletLoading;
}

export default function RsDetailMap({ lat: latProp, lng: lngProp }: Props) {
  const { t } = useLabels();
  const property = useSelector(selectors.getSelectedProperty);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<LeafletMap | null>(null);

  const lat = latProp ?? property?.lat;
  const lng = lngProp ?? property?.lng;

  useEffect(() => {
    if (lat == null || lng == null || !mapRef.current) return;
    const el = mapRef.current;
    let cancelled = false;

    loadLeaflet().then((L) => {
      if (cancelled || !el.isConnected) return;
      const map = L.map(el).setView([lat, lng], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);
      L.marker([lat, lng]).addTo(map);
      mapInstance.current = map;
    }).catch(() => {});

    return () => {
      cancelled = true;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [lat, lng]);

  if (lat == null || lng == null) {
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
