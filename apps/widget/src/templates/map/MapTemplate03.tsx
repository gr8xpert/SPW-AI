import RsMapContainer from '@/components/map/RsMapContainer';
import RsMapRadiusSearch from '@/components/map/RsMapRadiusSearch';
import RsMapResultsPanel from '@/components/map/RsMapResultsPanel';

/**
 * MapTemplate03 — Split panel: map left 60%, card list right 40%, filter bar on top.
 */
export default function MapTemplate03() {
  return (
    <div class="rs-map-template-03">
      <div class="rs-map-template-03__toolbar">
        <RsMapRadiusSearch />
      </div>

      <div class="rs-map-split">
        <div class="rs-map-split__map">
          <RsMapContainer zoom={10} />
        </div>
        <div class="rs-map-split__panel">
          <RsMapResultsPanel />
        </div>
      </div>
    </div>
  );
}
