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
  icon?: string;
}

export default function RsDetailSpecs({ property: propertyProp }: Props) {
  const { t } = useLabels();
  const { formatPrice } = useCurrency();
  const storeProperty = useSelector(selectors.getSelectedProperty);
  const property = propertyProp ?? storeProperty;

  const rows = useMemo<SpecRow[]>(() => {
    if (!property) return [];
    const specs: SpecRow[] = [
      { labelKey: 'detail_ref', fallback: 'Reference', value: property.reference, icon: 'M7 20l4-16m2 16l4-16M6 9h14M4 15h14' },
      { labelKey: 'card_bedrooms', fallback: 'Bedrooms', value: property.bedrooms, icon: 'M3 7v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M21 11H3V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4z' },
      { labelKey: 'card_bathrooms', fallback: 'Bathrooms', value: property.bathrooms, icon: 'M4 12h16a1 1 0 0 1 1 1v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-3a1 1 0 0 1 1-1zM6 12V5a2 2 0 0 1 2-2h3v2.25' },
      { labelKey: 'card_build_size', fallback: 'Build Size', value: property.buildSize, suffix: 'm²', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
      { labelKey: 'card_plot_size', fallback: 'Plot Size', value: property.plotSize, suffix: 'm²', icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z' },
      { labelKey: 'detail_terrace', fallback: 'Terrace', value: property.terraceSize, suffix: 'm²', icon: 'M18 10h2M6 10H4M12 2v2M4.93 4.93l1.41 1.41M17.66 6.34l1.41-1.41M12 18a6 6 0 0 0 0-12v12z' },
      { labelKey: 'detail_garden', fallback: 'Garden', value: property.gardenSize, suffix: 'm²', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
      { labelKey: 'detail_year_built', fallback: 'Year Built', value: property.year, icon: 'M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9zM3 9V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3M16 2v4M8 2v4' },
      { labelKey: 'detail_floor', fallback: 'Floor', value: property.floor, icon: 'M22 12H2M5 12V7M9 12V7M15 12V7M19 12V7M2 17h20' },
      { labelKey: 'detail_orientation', fallback: 'Orientation', value: property.orientation, icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
      { labelKey: 'detail_parking', fallback: 'Parking', value: property.parking, icon: 'M19 9l-7 7-7-7' },
      { labelKey: 'detail_energy_rating', fallback: 'Energy Rating', value: property.energyRating, icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
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
      <div class="rs-detail-specs">
        {visibleRows.map((row) => (
          <div key={row.labelKey} class="rs-detail-specs__item">
            <div class="rs-detail-specs__label">
              {row.icon && (
                <svg class="rs-detail-specs__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d={row.icon} />
                </svg>
              )}
              {t(row.labelKey, row.fallback)}
            </div>
            <div class="rs-detail-specs__value">
              {row.value}{row.suffix ? ` ${row.suffix}` : ''}
            </div>
          </div>
        ))}
        {hasCommunityFees && (
          <div class="rs-detail-specs__item">
            <div class="rs-detail-specs__label">
              {t('detail_community_fees', 'Community Fees')}
            </div>
            <div class="rs-detail-specs__value">
              {formatPrice(property.communityFees!, property.currency)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
