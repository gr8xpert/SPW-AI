import { useState, useCallback } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useMapPoints } from '@/hooks/useMapPoints';
import RsMapContainer from '@/components/map/RsMapContainer';
import RsMapLocationTags from '@/components/map/RsMapLocationTags';

/**
 * MapTemplate01 — Location chips on top, full-width map, Areas/Properties
 * switch at the bottom.
 */
export default function MapTemplate01() {
  const { t } = useLabels();
  const { points } = useMapPoints('search');
  const [view, setView] = useState<'zones' | 'properties'>('properties');
  const [fitBoundsKey, setFitBoundsKey] = useState<string | undefined>(undefined);

  const handleZoomToBounds = useCallback((bounds: string) => {
    setFitBoundsKey(Date.now() + ':' + bounds);
  }, []);

  const areas = new Set(points.map((p) => p.location?.id ?? `${p.lat},${p.lng}`)).size;

  return (
    <div class="rs-map-template-01">
      <RsMapLocationTags onZoomToBounds={handleZoomToBounds} />

      <div class="rs-map-template-01__map">
        <RsMapContainer zoom={10} fitBounds={fitBoundsKey} mode={view === 'zones' ? 'zones' : undefined} />
      </div>

      <div class="rs-map-template-01__footer">
        <div class="rs-map-switch" role="group" aria-label={t('map_show', 'Show')}>
          <button
            type="button"
            aria-pressed={view === 'zones'}
            class={`rs-map-switch__item${view === 'zones' ? ' rs-map-switch__item--active' : ''}`}
            onClick={() => setView('zones')}
          >
            {t('map_zones', 'Areas')} <span class="rs-map-switch__count">{areas}</span>
          </button>
          <button
            type="button"
            aria-pressed={view === 'properties'}
            class={`rs-map-switch__item${view === 'properties' ? ' rs-map-switch__item--active' : ''}`}
            onClick={() => setView('properties')}
          >
            {t('map_properties', 'Properties')} <span class="rs-map-switch__count">{points.length}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
