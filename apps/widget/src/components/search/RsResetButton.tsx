import { useCallback } from 'preact/hooks';
import { useFilters } from '@/hooks/useFilters';
import { useLabels } from '@/hooks/useLabels';

export default function RsResetButton() {
  const { resetFilters } = useFilters();
  const { t } = useLabels();

  const handleClick = useCallback(() => {
    resetFilters();
    if (window.RealtySoft) {
      window.RealtySoft.search();
    }
  }, [resetFilters]);

  return (
    <div class="rs_reset_button">
      <button
        type="button"
        class="rs-reset-btn"
        onClick={handleClick}
      >
        {t('reset_button', 'Reset')}
      </button>
    </div>
  );
}
