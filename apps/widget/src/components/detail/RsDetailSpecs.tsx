import { useMemo } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useCurrency } from '@/hooks/useCurrency';
import { useConfig } from '@/hooks/useConfig';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import { getDisplayReference, specRange, type SpecKey } from '@/core/property-display';
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

// The listing type in the page's language (the same labels the cards use).
const LISTING_TYPE_LABEL: Record<string, [string, string]> = {
  sale: ['card_for_sale', 'For Sale'],
  rent: ['card_for_rent', 'For Rent'],
  holiday_rent: ['card_holiday_rent', 'Holiday Rent'],
  development: ['card_development', 'Development'],
  offplan: ['card_offplan', 'Off Plan'],
};

// Only sold / rented tell a visitor something; every listing on the site is
// active, and the raw word "active" showed on Spanish pages (10-05).
const STATUS_LABEL: Record<string, [string, string]> = {
  sold: ['detail_status_sold', 'Sold'],
  rented: ['detail_status_rented', 'Rented'],
};

function areaRange(property: Property, key: SpecKey): string | undefined {
  const text = specRange(property, key);
  return text ? `${text} m²` : undefined;
}

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
      { labelKey: 'detail_listing_type', fallback: 'Listing Type', value: property.listingType ? (LISTING_TYPE_LABEL[property.listingType] ? t(...LISTING_TYPE_LABEL[property.listingType]) : property.listingType) : undefined },
      { labelKey: 'detail_development', fallback: 'Development', value: property.developmentName ?? undefined },
      { labelKey: 'key_ready_label', fallback: 'Key ready', value: property.keyReady ? t('yes', 'Yes') : undefined },
      // The detail labels, not the cards' short ones ("hab.", "baños").
      // Ranges on developments: "1–3", "39–107 m²".
      { labelKey: 'detail_bedrooms', fallback: 'Bedrooms', value: specRange(property, 'bedrooms') ?? undefined },
      { labelKey: 'detail_bathrooms', fallback: 'Bathrooms', value: specRange(property, 'bathrooms') ?? undefined },
      { labelKey: 'detail_built_area', fallback: 'Built Area', value: areaRange(property, 'buildSize') },
      { labelKey: 'detail_plot_size', fallback: 'Plot Size', value: areaRange(property, 'plotSize') },
      { labelKey: 'detail_terrace', fallback: 'Terrace', value: areaRange(property, 'terraceSize') },
      { labelKey: 'detail_garden', fallback: 'Garden', value: m2(property.gardenSize) },
      { labelKey: 'detail_year_built', fallback: 'Year Built', value: property.year },
      { labelKey: 'detail_floor', fallback: 'Floor', value: property.floor },
      { labelKey: 'detail_orientation', fallback: 'Orientation', value: property.orientation },
      { labelKey: 'detail_parking', fallback: 'Parking', value: property.parking },
      { labelKey: 'detail_energy_rating', fallback: 'Energy Rating', value: property.energyRating },
      { labelKey: 'detail_status', fallback: 'Status', value: property.status && STATUS_LABEL[property.status] ? t(...STATUS_LABEL[property.status]) : undefined },
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
