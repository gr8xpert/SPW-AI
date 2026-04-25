import { useCallback } from 'preact/hooks';
import { useSelector } from '@/hooks/useStore';
import { useLabels } from '@/hooks/useLabels';
import { selectors } from '@/core/selectors';
import { actions } from '@/core/actions';

export default function RsViewToggle() {
  const ui = useSelector(selectors.getUI);
  const { t } = useLabels();

  const setLayout = useCallback((layout: 'grid' | 'list') => {
    actions.mergeUI({ layout });
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
    </div>
  );
}
