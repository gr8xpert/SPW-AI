import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

export default function RsDetailTerrace() {
  const { t } = useLabels();
  const property = useSelector(selectors.getSelectedProperty);
  if (!property?.terraceSize) return null;

  return (
    <span class="rs-detail-spec rs-detail-spec--terrace">
      <span class="rs-detail-spec__value">{property.terraceSize} m²</span>
      <span class="rs-detail-spec__label">{t('detail_terrace', 'Terrace')}</span>
    </span>
  );
}
