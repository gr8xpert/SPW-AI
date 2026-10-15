// Purchase costs calculator: price + property type (+ seller for plots) →
// taxes, lawyer, notary and the total. A block of its own
// (data-spm-widget="purchase_costs", reads ?price= and ?type= from the
// address) and the body of the property page's "Calculate purchasing costs"
// popup (RsDetailPurchaseCosts).
import { useMemo, useState } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import {
  computeCosts,
  ratesFrom,
  type CostLine,
  type PlotSeller,
  type PurchaseType,
} from '@/core/purchase-costs';

interface Props {
  price?: number | string;
  type?: PurchaseType | string;
  currency?: string;
  // The popup has its own heading.
  heading?: boolean;
  [key: string]: unknown;
}

const TYPES: PurchaseType[] = ['new', 'resale', 'plot'];

function fromAddress(): { price?: number; type?: PurchaseType } {
  if (typeof window === 'undefined') return {};
  const q = new URLSearchParams(window.location.search);
  const price = Number(String(q.get('price') ?? '').replace(/[^\d]/g, ''));
  // DM-style links too: ?inm_plot=1 / ?inm_newdev=1.
  const raw = q.get('type') ?? (q.get('inm_plot') === '1' ? 'plot' : q.get('inm_newdev') === '1' ? 'new' : '');
  const type = raw === 'second' ? 'resale' : raw;
  return {
    price: price > 0 ? price : undefined,
    type: TYPES.includes(type as PurchaseType) ? (type as PurchaseType) : undefined,
  };
}

const LINE_LABEL: Record<CostLine['key'], [string, string]> = {
  vat: ['calc_vat', 'VAT (IVA)'],
  transfer_tax: ['calc_transfer_tax', 'Transfer tax (ITP)'],
  stamp_duty: ['calc_stamp_duty', 'Stamp duty (AJD)'],
  lawyer: ['calc_lawyer', 'Lawyer fees'],
  notary: ['calc_notary', 'Notary and Land Registry fees'],
};

export default function RsPurchaseCosts(props: Props) {
  const { t } = useLabels();
  const config = useConfig();
  const rates = ratesFrom(config.purchaseCosts);
  const url = useMemo(fromAddress, []);

  const startPrice = Number(props.price) > 0 ? Math.round(Number(props.price)) : url.price ?? 0;
  const startType = TYPES.includes(props.type as PurchaseType) ? (props.type as PurchaseType) : url.type ?? 'resale';

  const [price, setPrice] = useState(startPrice);
  const [type, setType] = useState<PurchaseType>(startType);
  const [seller, setSeller] = useState<PlotSeller>('private');

  const currency = props.currency || 'EUR';
  const fmt = useMemo(() => {
    try {
      return new Intl.NumberFormat(config.language || 'en', { style: 'currency', currency, maximumFractionDigits: 0 });
    } catch {
      return new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
    }
  }, [config.language, currency]);
  const group = useMemo(() => new Intl.NumberFormat(config.language || 'en', { maximumFractionDigits: 0 }), [config.language]);
  const rateFmt = useMemo(() => new Intl.NumberFormat(config.language || 'en', { maximumFractionDigits: 2 }), [config.language]);

  const { lines, costs, total } = computeCosts(price, type, seller, rates);

  const onPrice = (e: Event) => {
    const digits = (e.target as HTMLInputElement).value.replace(/[^\d]/g, '');
    setPrice(digits ? Math.min(Number(digits), 999_999_999) : 0);
  };

  const typeLabel: Record<PurchaseType, string> = {
    new: t('calc_type_new', 'New build'),
    resale: t('calc_type_resale', 'Resale'),
    plot: t('calc_type_plot', 'Plot'),
  };

  return (
    <div class="rs_purchase_costs rs-purchase-costs">
      {props.heading !== false && (
        <h2 class="rs-purchase-costs__heading">{t('calc_title', 'Purchase costs')}</h2>
      )}
      <div class="rs-purchase-costs__fields">
        <label class="rs-purchase-costs__field">
          <span class="rs-purchase-costs__label">{t('calc_price', 'Purchase price')}</span>
          <input
            class="rs-input rs-purchase-costs__price"
            type="text"
            inputMode="numeric"
            value={price ? group.format(price) : ''}
            placeholder="0"
            onInput={onPrice}
          />
        </label>
        <label class="rs-purchase-costs__field">
          <span class="rs-purchase-costs__label">{t('calc_type', 'Property type')}</span>
          <select class="rs-select" value={type} onChange={(e) => setType((e.target as HTMLSelectElement).value as PurchaseType)}>
            {TYPES.map((v) => <option key={v} value={v}>{typeLabel[v]}</option>)}
          </select>
        </label>
        {type === 'plot' && (
          <label class="rs-purchase-costs__field">
            <span class="rs-purchase-costs__label">{t('calc_seller', 'Seller')}</span>
            <select class="rs-select" value={seller} onChange={(e) => setSeller((e.target as HTMLSelectElement).value as PlotSeller)}>
              <option value="private">{t('calc_seller_private', 'Private individual')}</option>
              <option value="company">{t('calc_seller_company', 'Company or developer')}</option>
            </select>
          </label>
        )}
      </div>

      <table class="rs-purchase-costs__table">
        <tbody>
          {lines.map((l) => (
            <tr key={l.key} class={`rs-purchase-costs__row rs-purchase-costs__row--${l.key}`}>
              <th scope="row">{t(...LINE_LABEL[l.key])}</th>
              <td class="rs-purchase-costs__rate">{rateFmt.format(l.rate)}%</td>
              <td class="rs-purchase-costs__amount">{fmt.format(l.amount)}</td>
            </tr>
          ))}
          <tr class="rs-purchase-costs__row rs-purchase-costs__row--costs">
            <th scope="row" colSpan={2}>{t('calc_costs_total', 'Taxes and fees')}</th>
            <td class="rs-purchase-costs__amount">{fmt.format(costs)}</td>
          </tr>
          <tr class="rs-purchase-costs__row rs-purchase-costs__row--total">
            <th scope="row" colSpan={2}>{t('calc_total', 'Total cost of the purchase')}</th>
            <td class="rs-purchase-costs__amount">{fmt.format(total)}</td>
          </tr>
        </tbody>
      </table>

      <p class="rs-purchase-costs__note">
        {t('calc_disclaimer', 'Indicative figures only. Taxes and fees depend on your situation, the property and current regulations. This is not tax or legal advice.')}
      </p>
    </div>
  );
}
