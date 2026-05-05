import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

export default function RsDetailYear() {
  const { t } = useLabels();
  const property = useSelector(selectors.getSelectedProperty);
  if (!property?.year) return null;

  return (
    <span class="rs-detail-spec rs-detail-spec--year">
      <span class="rs-detail-spec__value">{property.year}</span>
      <span class="rs-detail-spec__label">{t('detail_year_built', 'Year Built')}</span>
    </span>
  );
}
