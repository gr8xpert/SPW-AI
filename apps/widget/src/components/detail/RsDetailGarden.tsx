import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

export default function RsDetailGarden() {
  const { t } = useLabels();
  const property = useSelector(selectors.getSelectedProperty);
  // "0.00" from the API is no garden.
  const size = Math.round(Number(property?.gardenSize));
  if (!property || !(size > 0)) return null;

  return (
    <span class="rs-detail-spec rs-detail-spec--garden">
      <span class="rs-detail-spec__value">{size} m²</span>
      <span class="rs-detail-spec__label">{t('detail_garden', 'Garden')}</span>
    </span>
  );
}
