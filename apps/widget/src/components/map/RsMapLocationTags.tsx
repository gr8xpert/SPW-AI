import { useMemo } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useMapPoints } from '@/hooks/useMapPoints';

interface LocationGroup {
  id: number | string;
  name: string;
  count: number;
  bounds: string;
}

interface RsMapLocationTagsProps {
  onZoomToBounds?: (bounds: string) => void;
  max?: number;
}

const MIN_SPAN = 0.01;

// One chip per area that has listings on the map (every listing of the
// search, not only the current page); a click zooms the map to that area.
export default function RsMapLocationTags({ onZoomToBounds, max = 12 }: RsMapLocationTagsProps) {
  const { t } = useLabels();
  const { points } = useMapPoints('search');

  const groups = useMemo(() => {
    const byLocation = new Map<string, { id: number | string; name: string; lats: number[]; lngs: number[] }>();
    for (const p of points) {
      if (!p.location) continue;
      const key = String(p.location.id);
      let g = byLocation.get(key);
      if (!g) byLocation.set(key, (g = { id: p.location.id, name: p.location.name, lats: [], lngs: [] }));
      g.lats.push(p.lat);
      g.lngs.push(p.lng);
    }
    const out: LocationGroup[] = [];
    for (const g of byLocation.values()) {
      let minLat = Math.min(...g.lats);
      let maxLat = Math.max(...g.lats);
      let minLng = Math.min(...g.lngs);
      let maxLng = Math.max(...g.lngs);
      if (maxLat - minLat < MIN_SPAN) [minLat, maxLat] = [(minLat + maxLat) / 2 - MIN_SPAN / 2, (minLat + maxLat) / 2 + MIN_SPAN / 2];
      if (maxLng - minLng < MIN_SPAN) [minLng, maxLng] = [(minLng + maxLng) / 2 - MIN_SPAN / 2, (minLng + maxLng) / 2 + MIN_SPAN / 2];
      out.push({ id: g.id, name: g.name, count: g.lats.length, bounds: `${minLat},${minLng},${maxLat},${maxLng}` });
    }
    return out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [points]);

  if (groups.length < 2) return null;

  return (
    <div class="rs-map-location-tags" role="toolbar" aria-label={t('map_areas', 'Areas')}>
      <button class="rs-map-location-tag rs-map-location-tag--all" type="button" onClick={() => onZoomToBounds?.('')}>
        {t('map_view_all', 'View all')}
        <span class="rs-map-location-tag__count">{points.length}</span>
      </button>
      {groups.slice(0, max).map((group) => (
        <button key={group.id} class="rs-map-location-tag" type="button" onClick={() => onZoomToBounds?.(group.bounds)}>
          {group.name}
          <span class="rs-map-location-tag__count">{group.count}</span>
        </button>
      ))}
    </div>
  );
}
