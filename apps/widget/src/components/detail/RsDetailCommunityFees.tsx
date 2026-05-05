import { useLabels } from '@/hooks/useLabels';
import { useCurrency } from '@/hooks/useCurrency';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

export default function RsDetailCommunityFees() {
  const { t } = useLabels();
  const { formatPrice } = useCurrency();
  const property = useSelector(selectors.getSelectedProperty);
  if (!property?.communityFees) return null;

  return (
    <span class="rs-detail-spec rs-detail-spec--fees">
      <span class="rs-detail-spec__value">
        {formatPrice(property.communityFees, property.currency)}/{t('detail_per_month', 'month')}
      </span>
      <span class="rs-detail-spec__label">{t('detail_community_fees', 'Community Fees')}</span>
    </span>
  );
}
