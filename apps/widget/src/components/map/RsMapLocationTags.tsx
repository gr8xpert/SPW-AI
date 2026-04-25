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
      const geoProps = props.filter((p) => p.lat != null && p.lng != null);
      if (geoProps.length === 0) {
        result.push({
          name,
          count: props.length,
          bounds: { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 },
        });
        continue;
      }
      const lats = geoProps.map((p) => p.lat!);
      const lngs = geoProps.map((p) => p.lng!);
      result.push({
        name,
        count: props.length,
        bounds: {
          minLat: Math.min(...lats),
          maxLat: Math.max(...lats),
          minLng: Math.min(...lngs),
          maxLng: Math.max(...lngs),
        },
      });
    }

    return result.sort((a, b) => b.count - a.count);
  }, [properties]);

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
