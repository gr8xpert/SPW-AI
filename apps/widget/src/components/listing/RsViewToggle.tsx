import { useCallback } from 'preact/hooks';
import { useSelector } from '@/hooks/useStore';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import { selectors } from '@/core/selectors';
import { actions } from '@/core/actions';

export default function RsViewToggle() {
  const ui = useSelector(selectors.getUI);
  const config = useConfig();
  const { t } = useLabels();
  const showMap = config.enableMapView !== false;

  const setLayout = useCallback((layout: 'grid' | 'list' | 'map') => {
    if (layout === 'map') {
      actions.mergeUI({ layout, mapVisible: true });
    } else {
      actions.mergeUI({ layout, mapVisible: false });
    }
  }, []);

  return (
    <div class="rs-view-toggle" role="group" aria-label={t('view_toggle', 'View toggle')}>
      <button
        class={`rs-view-toggle__btn${ui.layout === 'grid' ? ' rs-view-toggle__btn--active' : ''}`}
        onClick={() => setLayout('grid')}
        aria-pressed={ui.layout === 'grid'}
        title={t('view_grid', 'Grid view')}
        type="button"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      </button>
      <button
        class={`rs-view-toggle__btn${ui.layout === 'list' ? ' rs-view-toggle__btn--active' : ''}`}
        onClick={() => setLayout('list')}
        aria-pressed={ui.layout === 'list'}
        title={t('view_list', 'List view')}
        type="button"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      </button>
      {showMap && (
        <button
          class={`rs-view-toggle__btn${ui.layout === 'map' ? ' rs-view-toggle__btn--active' : ''}`}
          onClick={() => setLayout('map')}
          aria-pressed={ui.layout === 'map'}
          title={t('view_map', 'Map view')}
          type="button"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
            <line x1="8" y1="2" x2="8" y2="18" />
            <line x1="16" y1="6" x2="16" y2="22" />
          </svg>
        </button>
      )}
    </div>
  );
}
