import { useCallback } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import { actions } from '@/core/actions';

export default function RsDetailBack() {
  const { t } = useLabels();
  const config = useConfig();

  const handleBack = useCallback(() => {
    actions.setSelectedProperty(null);

    // Mark that we want scroll restoration on the results page
    try {
      const ctx = sessionStorage.getItem('spm_back_context');
      if (ctx) {
        const parsed = JSON.parse(ctx);
        sessionStorage.setItem('spm_scroll_target', parsed.ref);
      }
    } catch { /* storage unavailable */ }

    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else if (config.resultsPage) {
      window.location.href = config.resultsPage;
    }
  }, [config]);

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
