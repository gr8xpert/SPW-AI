import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

export default function RsDetailOrientation() {
  const { t } = useLabels();
  const property = useSelector(selectors.getSelectedProperty);
  if (!property?.orientation) return null;

  return (
    <span class="rs-detail-spec rs-detail-spec--orientation">
      <span class="rs-detail-spec__value">{property.orientation}</span>
      <span class="rs-detail-spec__label">{t('detail_orientation', 'Orientation')}</span>
    </span>
  );
}
