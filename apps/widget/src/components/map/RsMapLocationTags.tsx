import { useMemo, useCallback } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import type { Property } from '@/types';

interface LocationGroup {
  name: string;
  count: number;
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}

interface RsMapLocationTagsProps {
  onZoomToBounds?: (bounds: string) => void;
}

export default function RsMapLocationTags({ onZoomToBounds }: RsMapLocationTagsProps) {
  const { t } = useLabels();
  const results = useSelector(selectors.getResults);
  const locations = useSelector(selectors.getLocations);
  const properties = results?.data ?? [];

  const locationGroups = useMemo(() => {
    const groups = new Map<string, { props: Property[] }>();
    for (const prop of properties) {
      const name = prop.location.name;
      if (!groups.has(name)) {
        groups.set(name, { props: [] });
      }
      groups.get(name)!.props.push(prop);
    }

    const result: LocationGroup[] = [];
    for (const [name, { props }] of groups) {
      const lats: number[] = [];
      const lngs: number[] = [];

      for (const p of props) {
        if (p.lat != null && p.lng != null) {
          lats.push(p.lat);
          lngs.push(p.lng);
        } else {
          const loc = locations.find((l) => l.id === p.location.id);
          if (loc?.lat != null && loc?.lng != null) {
            lats.push(loc.lat);
            lngs.push(loc.lng);
          }
        }
      }

      if (lats.length === 0) {
        result.push({
          name,
          count: props.length,
          bounds: { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 },
        });
        continue;
      }

      let minLat = Math.min(...lats);
      let maxLat = Math.max(...lats);
      let minLng = Math.min(...lngs);
      let maxLng = Math.max(...lngs);

      // Ensure minimum bounds area so all markers are visible after zoom
      const MIN_SPAN = 0.005;
      if (maxLat - minLat < MIN_SPAN) {
        const midLat = (minLat + maxLat) / 2;
        minLat = midLat - MIN_SPAN / 2;
        maxLat = midLat + MIN_SPAN / 2;
      }
      if (maxLng - minLng < MIN_SPAN) {
        const midLng = (minLng + maxLng) / 2;
        minLng = midLng - MIN_SPAN / 2;
        maxLng = midLng + MIN_SPAN / 2;
      }

      result.push({ name, count: props.length, bounds: { minLat, maxLat, minLng, maxLng } });
    }

    return result.sort((a, b) => b.count - a.count);
  }, [properties, locations]);

  const handleClick = useCallback(
    (group: LocationGroup) => {
      if (onZoomToBounds) {
        const { minLat, minLng, maxLat, maxLng } = group.bounds;
        onZoomToBounds(`${minLat},${minLng},${maxLat},${maxLng}`);
      }
    },
    [onZoomToBounds],
  );

  if (locationGroups.length === 0) return null;

  return (
    <div class="rs-map-location-tags">
      <button
        class="rs-map-location-tag rs-map-location-tag--all"
        type="button"
        onClick={() => onZoomToBounds?.('')}
      >
        {t('map_view_all', 'View All')}
      </button>
      {locationGroups.map((group) => (
        <button
          key={group.name}
          class="rs-map-location-tag"
          type="button"
          onClick={() => handleClick(group)}
        >
          {group.name}
          <span class="rs-map-location-tag__count">{group.count}</span>
        </button>
      ))}
    </div>
  );
}
