import { useCallback } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { actions } from '@/core/actions';

export default function RsDetailBack() {
  const { t } = useLabels();

  const handleBack = useCallback(() => {
    actions.setSelectedProperty(null);
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    }
  }, []);

  return (
    <button
      class="rs-detail-back"
      onClick={handleBack}
      type="button"
    >
      <span class="rs-detail-back__arrow">&larr;</span>
      {t('detail_back', 'Back')}
    </button>
  );
}
