// "Calculate purchasing costs" on the property page. Opens the calculator in a
// popup with this listing's price and type filled in, or — when the client
// set a calculator page in the dashboard — goes to that page with ?price=.
// Sale listings only (a tax calculation means nothing for a rental), and only
// while the client has the calculator switched on.
import { useEffect, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import { calculatorUrl, purchaseTypeOf } from '@/core/purchase-costs';
import RsPurchaseCosts from '@/components/utility/RsPurchaseCosts';
import type { Property } from '@/types';

interface Props {
  property?: Property;
  [key: string]: unknown;
}

const RENTALS = new Set(['rent', 'holiday_rent']);

export default function RsDetailPurchaseCosts({ property: propertyProp }: Props) {
  const { t } = useLabels();
  const config = useConfig();
  const storeProperty = useSelector(selectors.getSelectedProperty);
  const property = propertyProp ?? storeProperty;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const price = Number(property?.price) || 0;
  if (!config.purchaseCosts || !property || price <= 0 || RENTALS.has(String(property.listingType))) return null;

  const type = purchaseTypeOf(property);
  const label = t('calc_button', 'Calculate purchasing costs');
  const pageUrl = typeof config.purchaseCosts.pageUrl === 'string' ? config.purchaseCosts.pageUrl.trim() : '';
  const pageHref = pageUrl ? calculatorUrl(pageUrl, price, type) : '';

  if (pageHref) {
    return (
      <a class="rs-detail-purchase-costs rs-detail-action-btn" href={pageHref}>
        {label}
      </a>
    );
  }

  return (
    <>
      <button type="button" class="rs-detail-purchase-costs rs-detail-action-btn" onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div class="rs-modal-backdrop rs-backdrop-enter rs-purchase-costs-modal" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div class="rs-modal-content rs-modal-enter" role="dialog" aria-modal="true" aria-label={t('calc_title', 'Purchase costs')}>
            <div class="rs-modal-header">
              <span class="rs-modal-header__title">{t('calc_title', 'Purchase costs')}</span>
              <button type="button" class="rs-modal-header__close" aria-label={t('close', 'Close')} onClick={() => setOpen(false)}>&times;</button>
            </div>
            <div class="rs-modal-body">
              <RsPurchaseCosts price={price} type={type} currency={property.currency} heading={false} />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
