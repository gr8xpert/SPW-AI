import { useLabels } from '@/hooks/useLabels';
import { useCurrency } from '@/hooks/useCurrency';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import type { Property } from '@/types';

interface Props {
  property?: Property;
}

/**
 * Community fees (monthly), IBI and Basura (yearly) as three cards under the
 * description (property page design 01). Hidden when none is entered.
 */
export default function RsDetailTaxesFees({ property: propertyProp }: Props) {
  const { t } = useLabels();
  const { formatPrice } = useCurrency();
  const storeProperty = useSelector(selectors.getSelectedProperty);
  const property = propertyProp ?? storeProperty;
  if (!property) return null;

  const month = t('detail_per_month', 'month');
  const year = t('detail_per_year', 'year');
  // The API can send "0.00" (truthy), so compare numbers; 0 means not entered.
  const rows: [string, string, number, string][] = [
    ['community', t('detail_community_fees', 'Community Fees'), Number(property.communityFees) || 0, month],
    ['ibi', t('detail_ibi_tax', 'IBI Tax'), Number(property.ibiFees) || 0, year],
    ['basura', t('detail_basura_tax', 'Basura Tax'), Number(property.basuraTax) || 0, year],
  ];
  const shown = rows.filter(([, , v]) => v > 0);
  if (!shown.length) return null;

  return (
    <div class="rs-detail-section rs-detail-fees">
      <h2 class="rs-detail-section__heading">{t('detail_taxes_fees', 'Taxes & Fees')}</h2>
      <div class="rs-detail-fees__grid">
        {shown.map(([key, label, value, per]) => (
          <div key={key} class={`rs-detail-fees__card rs-detail-fees__card--${key}`}>
            <div class="rs-detail-fees__label">{label}</div>
            <div class="rs-detail-fees__value">{formatPrice(value, property.currency)}/{per}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
