import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

const STATUS_LABELS: Record<string, string> = {
  sale: 'For Sale',
  rent: 'For Rent',
  holiday_rent: 'Holiday Rent',
  development: 'Development',
};

export default function RsDetailStatus() {
  const { t } = useLabels();
  const property = useSelector(selectors.getSelectedProperty);
  if (!property) return null;

  const label = STATUS_LABELS[property.listingType] || property.listingType;

  return (
    <span class="rs-detail-status">
      {t(`detail_status_${property.listingType}`, label)}
    </span>
  );
}
