import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import RsMapContainer from '@/components/map/RsMapContainer';
import RsMapRadiusSearch from '@/components/map/RsMapRadiusSearch';
import RsMapViewToggle from '@/components/map/RsMapViewToggle';

/**
 * MapTemplate02 — Filter bar on top, full-width map, list/map toggle.
 */
export default function MapTemplate02() {
  const ui = useSelector(selectors.getUI);

  return (
    <div class="rs-map-template-02">
      <div class="rs-map-template-02__toolbar">
        <RsMapRadiusSearch />
        <RsMapViewToggle />
      </div>

      {ui.mapVisible && (
        <div class="rs-map-template-02__map">
          <RsMapContainer zoom={10} />
        </div>
      )}
    </div>
  );
}
