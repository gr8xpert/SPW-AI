import { useMemo } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useCurrency } from '@/hooks/useCurrency';
import { useConfig } from '@/hooks/useConfig';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import { getDisplayReference } from '@/core/property-display';
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

const LISTING_TYPE_LABEL: Record<string, string> = {
  sale: 'For Sale',
  rent: 'For Rent',
  holiday_rent: 'Holiday Rent',
  development: 'Development',
  offplan: 'Off Plan',
};

function m2(n: number | undefined): string | undefined {
  if (n == null || n <= 0) return undefined;
  return `${Math.round(n)} m²`;
}

export default function RsDetailSpecs({ property: propertyProp }: Props) {
  const { t } = useLabels();
  const { formatPrice } = useCurrency();
  const config = useConfig();
  const storeProperty = useSelector(selectors.getSelectedProperty);
  const property = propertyProp ?? storeProperty;

  const rows = useMemo<SpecRow[]>(() => {
    if (!property) return [];
    return [
      { labelKey: 'detail_ref', fallback: 'Reference', value: getDisplayReference(property, config) },
      { labelKey: 'detail_property_type', fallback: 'Property Type', value: property.propertyType?.name },
      { labelKey: 'detail_listing_type', fallback: 'Listing Type', value: property.listingType ? (LISTING_TYPE_LABEL[property.listingType] || property.listingType) : undefined },
      { labelKey: 'card_bedrooms', fallback: 'Beds', value: property.bedrooms },
      { labelKey: 'card_bathrooms', fallback: 'Baths', value: property.bathrooms },
      { labelKey: 'card_build_size', fallback: 'Built Area', value: m2(property.buildSize) },
      { labelKey: 'card_plot_size', fallback: 'Plot Size', value: m2(property.plotSize) },
      { labelKey: 'detail_terrace', fallback: 'Terrace', value: m2(property.terraceSize) },
      { labelKey: 'detail_garden', fallback: 'Garden', value: m2(property.gardenSize) },
      { labelKey: 'detail_year_built', fallback: 'Year Built', value: property.year },
      { labelKey: 'detail_floor', fallback: 'Floor', value: property.floor },
      { labelKey: 'detail_orientation', fallback: 'Orientation', value: property.orientation },
      { labelKey: 'detail_parking', fallback: 'Parking', value: property.parking },
      { labelKey: 'detail_energy_rating', fallback: 'Energy Rating', value: property.energyRating },
      { labelKey: 'detail_status', fallback: 'Status', value: property.status },
      { labelKey: 'detail_address', fallback: 'Address', value: property.address },
      { labelKey: 'detail_zip', fallback: 'Zip Code', value: property.zipCode },
      { labelKey: 'detail_community_fees', fallback: 'Community Fees',
        value: property.communityFees != null && property.communityFees > 0
          ? `${formatPrice(property.communityFees, property.currency)}/${t('detail_per_month', 'month')}`
          : undefined },
    ];
  }, [property, t, formatPrice, config]);

  if (!property) return null;

  // A field is "present" only if it has a real value. 0, null, undefined, empty
  // string all get hidden — including m² fields where 0 means "not measured".
  const visibleRows = rows.filter((r) => {
    if (r.value == null) return false;
    if (typeof r.value === 'number') return r.value !== 0;
    if (typeof r.value === 'string') return r.value.trim() !== '';
    return true;
  });

  if (!visibleRows.length) return null;

  // Pair into a 2-column table. Odd trailing row shows a shaded empty cell pair.
  const pairs: Array<[SpecRow, SpecRow | null]> = [];
  for (let i = 0; i < visibleRows.length; i += 2) {
    pairs.push([visibleRows[i], visibleRows[i + 1] ?? null]);
  }

  return (
    <div class="rs-detail-section">
      <h2 class="rs-detail-section__heading">
        {t('detail_property_info', 'Property Information')}
      </h2>
      <table class="rs-detail-specs-table">
        <tbody>
          {pairs.map(([left, right]) => (
            <tr key={left.labelKey}>
              <th class="rs-detail-specs-table__label">{t(left.labelKey, left.fallback)}</th>
              <td class="rs-detail-specs-table__value">{left.value}{left.suffix ? ` ${left.suffix}` : ''}</td>
              {right ? (
                <>
                  <th class="rs-detail-specs-table__label">{t(right.labelKey, right.fallback)}</th>
                  <td class="rs-detail-specs-table__value">{right.value}{right.suffix ? ` ${right.suffix}` : ''}</td>
                </>
              ) : (
                <>
                  <th class="rs-detail-specs-table__label rs-detail-specs-table__label--empty" />
                  <td class="rs-detail-specs-table__value rs-detail-specs-table__value--empty" />
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
