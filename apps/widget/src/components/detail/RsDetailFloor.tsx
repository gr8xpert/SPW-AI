import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

export default function RsDetailFloor() {
  const { t } = useLabels();
  const property = useSelector(selectors.getSelectedProperty);
  if (!property?.floor) return null;

  return (
    <span class="rs-detail-spec rs-detail-spec--floor">
      <span class="rs-detail-spec__value">{property.floor}</span>
      <span class="rs-detail-spec__label">{t('detail_floor', 'Floor')}</span>
    </span>
  );
}
