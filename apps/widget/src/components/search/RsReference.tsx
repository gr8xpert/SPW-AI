import { useCallback } from 'preact/hooks';
import { useFilters } from '@/hooks/useFilters';
import { useLabels } from '@/hooks/useLabels';

export default function RsReference() {
  const { filters, setFilter } = useFilters();
  const { t } = useLabels();
  const label = t('reference_label', 'Reference');
  const placeholder = t('reference_placeholder', 'Enter reference...');

  const handleInput = useCallback((e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    setFilter('reference', value || undefined);
  }, [setFilter]);

  return (
    <div class="rs_reference rs-field">
      <label class="rs-field__label">{label}</label>
      <input
        type="text"
        class="rs-input"
        placeholder={placeholder}
        value={filters.reference ?? ''}
        onInput={handleInput}
      />
    </div>
  );
}
