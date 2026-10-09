import { useLabels } from '@/hooks/useLabels';
import { useCurrency } from '@/hooks/useCurrency';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import type { DevelopmentUnit, Property } from '@/types';

interface Props {
  property?: Property;
}

const STATUS_LABEL: Record<string, [string, string]> = {
  available: ['detail_unit_available', 'Available'],
  reserved: ['detail_unit_reserved', 'Reserved'],
  sold: ['detail_unit_sold', 'Sold'],
};

function m2(n: number | null): string {
  return n != null && n > 0 ? `${Math.round(n)} m²` : '–';
}

function num(n: number | null): string {
  return n != null && n > 0 ? String(n) : '–';
}

/**
 * A new development's units with their current prices (Resales PriceList).
 * Sold units stay in the list, greyed, without a price. Nothing renders for
 * a listing without units, or with just one: its row would repeat Property
 * Information (type, beds, baths, sizes) and the price above it.
 */
export default function RsDetailPriceList({ property: propertyProp }: Props) {
  const { t } = useLabels();
  const { formatPrice } = useCurrency();
  const storeProperty = useSelector(selectors.getSelectedProperty);
  const property = propertyProp ?? storeProperty;
  const units: DevelopmentUnit[] = Array.isArray(property?.units) ? property!.units! : [];
  if (!property || units.length < 2) return null;

  const available = units.filter((u) => u.status !== 'sold').length;
  const summary = t('detail_units_available', '{count} of {total} units available')
    .replace('{count}', String(available))
    .replace('{total}', String(units.length));
  const showKeyReady = units.some((u) => u.keyReady) && !property.keyReady;

  return (
    <div class="rs-detail-section rs-detail-price-list">
      <h2 class="rs-detail-section__heading">{t('detail_price_list', 'Price list')}</h2>
      <p class="rs-detail-price-list__summary">{summary}</p>
      <div class="rs-detail-price-list__scroll">
        <table class="rs-detail-price-list__table">
          <thead>
            <tr>
              <th>{t('detail_unit', 'Unit')}</th>
              <th>{t('detail_unit_type', 'Type')}</th>
              <th class="rs-detail-price-list__num">{t('detail_bedrooms', 'Bedrooms')}</th>
              <th class="rs-detail-price-list__num">{t('detail_bathrooms', 'Bathrooms')}</th>
              <th class="rs-detail-price-list__num">{t('detail_built_area', 'Built Area')}</th>
              <th class="rs-detail-price-list__num">{t('detail_terrace', 'Terrace')}</th>
              <th class="rs-detail-price-list__num">{t('detail_price', 'Price')}</th>
              <th>{t('detail_unit_status', 'Status')}</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u, i) => {
              const status = STATUS_LABEL[u.status] ? t(...STATUS_LABEL[u.status]) : u.status;
              const sold = u.status === 'sold';
              return (
                <tr key={`${u.name}-${i}`} class={sold ? 'rs-detail-price-list__row--sold' : undefined}>
                  <td class="rs-detail-price-list__name">{u.name || '–'}</td>
                  <td class="rs-detail-price-list__type">{u.type || '–'}</td>
                  <td class="rs-detail-price-list__num" data-label={t('detail_bedrooms', 'Bedrooms')}>{num(u.bedrooms)}</td>
                  <td class="rs-detail-price-list__num" data-label={t('detail_bathrooms', 'Bathrooms')}>{num(u.bathrooms)}</td>
                  <td class="rs-detail-price-list__num" data-label={t('detail_built_area', 'Built Area')}>{m2(u.builtSize)}</td>
                  <td class="rs-detail-price-list__num" data-label={t('detail_terrace', 'Terrace')}>{m2(u.terraceSize)}</td>
                  <td class="rs-detail-price-list__num rs-detail-price-list__price">
                    {!sold && u.price != null && u.price > 0 ? formatPrice(u.price, property.currency) : '–'}
                  </td>
                  <td class="rs-detail-price-list__state">
                    <span class={`rs-detail-price-list__status rs-detail-price-list__status--${u.status.replace(/[^a-z0-9-]/g, '')}`}>
                      {status}
                    </span>
                    {showKeyReady && u.keyReady && !sold && (
                      <span class="rs-detail-price-list__key-ready">{t('card_key_ready', 'Key Ready')}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
