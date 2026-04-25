import { useMemo } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useCurrency } from '@/hooks/useCurrency';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import type { Property } from '@/types';

interface Props {
  property?: Property;
}

interface SpecRow {
  labelKey: string;
  fallback: string;
  value: string | number | undefined;
  suffix?: string;
}

export default function RsDetailSpecs({ property: propertyProp }: Props) {
  const { t } = useLabels();
  const { formatPrice } = useCurrency();
  const storeProperty = useSelector(selectors.getSelectedProperty);
  const property = propertyProp ?? storeProperty;

  const rows = useMemo<SpecRow[]>(() => {
    if (!property) return [];
    const specs: SpecRow[] = [
      { labelKey: 'card_bedrooms', fallback: 'Bedrooms', value: property.bedrooms },
      { labelKey: 'card_bathrooms', fallback: 'Bathrooms', value: property.bathrooms },
      { labelKey: 'card_build_size', fallback: 'Build Size', value: property.buildSize, suffix: 'm²' },
      { labelKey: 'card_plot_size', fallback: 'Plot Size', value: property.plotSize, suffix: 'm²' },
      { labelKey: 'detail_terrace', fallback: 'Terrace', value: property.terraceSize, suffix: 'm²' },
      { labelKey: 'detail_garden', fallback: 'Garden', value: property.gardenSize, suffix: 'm²' },
      { labelKey: 'detail_year_built', fallback: 'Year Built', value: property.year },
      { labelKey: 'detail_floor', fallback: 'Floor', value: property.floor },
      { labelKey: 'detail_orientation', fallback: 'Orientation', value: property.orientation },
      { labelKey: 'detail_parking', fallback: 'Parking', value: property.parking },
      { labelKey: 'detail_energy_rating', fallback: 'Energy Rating', value: property.energyRating },
    ];
    return specs;
  }, [property]);

  if (!property) return null;

  const visibleRows = rows.filter((r) => r.value != null && r.value !== '');

  const hasCommunityFees = property.communityFees != null && property.communityFees > 0;

  if (!visibleRows.length && !hasCommunityFees) {
    return null;
  }

  return (
    <div class="rs-detail-section">
      <h2 class="rs-detail-section__heading">
        {t('detail_specifications', 'Specifications')}
      </h2>
      <table class="rs-detail-specs">
        <tbody>
          {visibleRows.map((row) => (
            <tr key={row.labelKey} class="rs-detail-specs__row">
              <td class="rs-detail-specs__label">
                {t(row.labelKey, row.fallback)}
              </td>
              <td class="rs-detail-specs__value">
                {row.value}{row.suffix ? ` ${row.suffix}` : ''}
              </td>
            </tr>
          ))}
          {hasCommunityFees && (
            <tr class="rs-detail-specs__row">
              <td class="rs-detail-specs__label">
                {t('detail_community_fees', 'Community Fees')}
              </td>
              <td class="rs-detail-specs__value">
                {formatPrice(property.communityFees!, property.currency)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
