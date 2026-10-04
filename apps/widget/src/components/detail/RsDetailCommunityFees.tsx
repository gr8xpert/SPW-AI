import { useLabels } from '@/hooks/useLabels';
import { useCurrency } from '@/hooks/useCurrency';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

export default function RsDetailCommunityFees() {
  const { t } = useLabels();
  const { formatPrice } = useCurrency();
  const property = useSelector(selectors.getSelectedProperty);
  // 0 means not entered; the API can send it as the string "0.00", which is
  // truthy, so compare the number.
  const fees = Number(property?.communityFees);
  if (!property || !(fees > 0)) return null;

  return (
    <span class="rs-detail-spec rs-detail-spec--fees">
      <span class="rs-detail-spec__value">
        {formatPrice(fees, property.currency)}/{t('detail_per_month', 'month')}
      </span>
      <span class="rs-detail-spec__label">{t('detail_community_fees', 'Community Fees')}</span>
    </span>
  );
}
