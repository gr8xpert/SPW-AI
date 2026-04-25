import { useCallback } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import { actions } from '@/core/actions';

export default function RsMapViewToggle() {
  const { t } = useLabels();
  const ui = useSelector(selectors.getUI);

  const handleListView = useCallback(() => {
    actions.mergeUI({ mapVisible: false });
  }, []);

  const handleMapView = useCallback(() => {
    actions.mergeUI({ mapVisible: true });
  }, []);

  return (
    <div class="rs-btn-group rs-map-view-toggle">
      <button
        type="button"
        class={`rs-btn-group__item${!ui.mapVisible ? ' rs-btn-group__item--active' : ''}`}
        onClick={handleListView}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
        {t('map_list_view', 'List')}
      </button>
      <button
        type="button"
        class={`rs-btn-group__item${ui.mapVisible ? ' rs-btn-group__item--active' : ''}`}
        onClick={handleMapView}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
          <line x1="8" y1="2" x2="8" y2="18" />
          <line x1="16" y1="6" x2="16" y2="22" />
        </svg>
        {t('map_map_view', 'Map')}
      </button>
    </div>
  );
}
