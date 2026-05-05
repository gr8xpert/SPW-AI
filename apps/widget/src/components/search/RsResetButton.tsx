import { useCallback } from 'preact/hooks';
import { useFilters } from '@/hooks/useFilters';
import { useLabels } from '@/hooks/useLabels';

interface Props {
  variation?: number;
  [key: string]: unknown;
}

export default function RsResetButton({ variation = 2 }: Props) {
  const { resetFilters } = useFilters();
  const { t } = useLabels();

  const handleClick = useCallback(() => {
    resetFilters();
    if (window.RealtySoft) {
      window.RealtySoft.search();
    }
  }, [resetFilters]);

  const label = t('reset_button', 'Reset');

  if (variation === 1) {
    return (
      <div class="rs_reset_button">
        <button type="button" class="rs-reset-btn" onClick={handleClick}>
          {label}
        </button>
      </div>
    );
  }

  return (
    <div class="rs_reset_button">
      <button type="button" class="rs-reset-btn rs-reset-btn--icon" onClick={handleClick} title={label}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 4v6h6" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
      </button>
    </div>
  );
}
