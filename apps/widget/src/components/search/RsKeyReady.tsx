import { useFilters } from '@/hooks/useFilters';
import { useLabels } from '@/hooks/useLabels';
import { useFacets } from '@/hooks/useFacets';

interface Props {
  [key: string]: unknown;
}

/**
 * "Key ready" tick: only new developments ready to move into. Shown only when
 * the search on screen has key-ready listings (or the tick is already on), so
 * sites without developments never see it. Inside the Features popup and as
 * its own block (rs_key_ready) for custom layouts.
 */
export default function RsKeyReady(_props: Props) {
  const { filters, setFilter, isLocked } = useFilters();
  const { t } = useLabels();
  const facets = useFacets();
  const checked = !!filters.keyReady;
  const locked = isLocked('keyReady');

  if (!checked && !(facets?.keyReady && facets.keyReady > 0)) return null;

  return (
    <div class={`rs_key_ready${locked ? ' rs-field--locked' : ''}`}>
      <label class="rs-checkbox">
        <input
          type="checkbox"
          checked={checked}
          disabled={locked}
          onChange={() => setFilter('keyReady', (checked ? undefined : true) as boolean)}
        />
        <span>{t('key_ready_label', 'Key ready')}</span>
      </label>
    </div>
  );
}
