import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import RsMapContainer from '@/components/map/RsMapContainer';
import RsMapRadiusSearch from '@/components/map/RsMapRadiusSearch';
import RsMapResultsPanel from '@/components/map/RsMapResultsPanel';
import RsMapViewToggle from '@/components/map/RsMapViewToggle';

/**
 * MapTemplate02 — Area search on top, full-width map or list (switch).
 */
export default function MapTemplate02() {
  const ui = useSelector(selectors.getUI);
  const showMap = ui.mapVisible !== false;

  return (
    <div class="rs-map-template-02">
      <div class="rs-map-template-02__toolbar">
        <RsMapRadiusSearch />
        <RsMapViewToggle />
      </div>

      {showMap ? (
        <div class="rs-map-template-02__map">
          <RsMapContainer zoom={10} />
        </div>
      ) : (
        <div class="rs-map-template-02__list">
          <RsMapResultsPanel layout="grid" />
        </div>
      )}
    </div>
  );
}
