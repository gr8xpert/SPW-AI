import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import { specRange } from '@/core/property-display';

export default function RsDetailTerrace() {
  const { t } = useLabels();
  const property = useSelector(selectors.getSelectedProperty);
  // "0.00" from the API is no size: nothing to show.
  const value = property ? specRange(property, 'terraceSize') : null;
  if (!property || !value) return null;

  return (
    <span class="rs-detail-spec rs-detail-spec--terrace">
      <span class="rs-detail-spec__value">{value} m²</span>
      <span class="rs-detail-spec__label">{t('detail_terrace', 'Terrace')}</span>
    </span>
  );
}
