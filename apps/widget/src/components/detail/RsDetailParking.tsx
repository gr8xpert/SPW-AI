import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

export default function RsDetailParking() {
  const { t } = useLabels();
  const property = useSelector(selectors.getSelectedProperty);
  if (!property?.parking) return null;

  return (
    <span class="rs-detail-spec rs-detail-spec--parking">
      <span class="rs-detail-spec__value">{property.parking}</span>
      <span class="rs-detail-spec__label">{t('detail_parking', 'Parking')}</span>
    </span>
  );
}
