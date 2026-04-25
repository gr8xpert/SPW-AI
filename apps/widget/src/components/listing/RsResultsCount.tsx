import { useSelector } from '@/hooks/useStore';
import { useLabels } from '@/hooks/useLabels';
import { selectors } from '@/core/selectors';

export default function RsResultsCount() {
  const results = useSelector(selectors.getResults);
  const { t } = useLabels();

  if (!results) return null;

  const { page, limit, total } = results.meta;
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div class="rs-results-count">
      <span>
        {t('results_showing', 'Showing')}{' '}
        <strong>{start}–{end}</strong>{' '}
        {t('results_of', 'of')}{' '}
        <strong>{total}</strong>{' '}
        {t('results_properties', 'properties')}
      </span>
    </div>
  );
}
