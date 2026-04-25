import { useState, useCallback } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import RsMapContainer from '@/components/map/RsMapContainer';
import RsMapLocationTags from '@/components/map/RsMapLocationTags';

/**
 * MapTemplate01 — Location tags on top, full-width map, zone/property toggle at bottom.
 */
export default function MapTemplate01() {
  const { t } = useLabels();
  const results = useSelector(selectors.getResults);
  const [activeTab, setActiveTab] = useState<'zones' | 'properties'>('properties');

  const properties = results?.data ?? [];
  const geoProperties = properties.filter((p) => p.lat != null && p.lng != null);

  const handleZoomToBounds = useCallback((_bounds: string) => {
    // Bounds zoom is handled by map container via filters
    // A future enhancement can use a ref to the map to call fitBounds directly
  }, []);

  return (
    <div class="rs-map-template-01">
      <RsMapLocationTags onZoomToBounds={handleZoomToBounds} />

      <div class="rs-map-template-01__map">
        <RsMapContainer zoom={10} />
      </div>

      <div class="rs-map-template-01__footer">
        <div class="rs-btn-group">
          <button
            type="button"
            class={`rs-btn-group__item${activeTab === 'zones' ? ' rs-btn-group__item--active' : ''}`}
            onClick={() => setActiveTab('zones')}
          >
            {t('map_zones', 'Zones')}
          </button>
          <button
            type="button"
            class={`rs-btn-group__item${activeTab === 'properties' ? ' rs-btn-group__item--active' : ''}`}
            onClick={() => setActiveTab('properties')}
          >
            {t('map_properties', 'Properties')} ({geoProperties.length})
          </button>
        </div>
      </div>
    </div>
  );
}
