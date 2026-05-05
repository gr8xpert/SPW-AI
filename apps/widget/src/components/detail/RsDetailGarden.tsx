import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

export default function RsDetailGarden() {
  const { t } = useLabels();
  const property = useSelector(selectors.getSelectedProperty);
  if (!property?.gardenSize) return null;

  return (
    <span class="rs-detail-spec rs-detail-spec--garden">
      <span class="rs-detail-spec__value">{property.gardenSize} m²</span>
      <span class="rs-detail-spec__label">{t('detail_garden', 'Garden')}</span>
    </span>
  );
}
