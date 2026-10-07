import { useLabels } from '@/hooks/useLabels';
import { useCurrency } from '@/hooks/useCurrency';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import { formatPropertyPrice } from '@/core/property-display';

interface Props {
  price?: number;
  currency?: string;
  priceOnRequest?: boolean;
}

// "€45,000", "€1,750 – €2,450 / week" or "Price on request" (see property-display).
export default function RsDetailPrice({ price: priceProp, currency: currencyProp, priceOnRequest: porProp }: Props) {
  const { t } = useLabels();
  const { formatPrice } = useCurrency();
  const property = useSelector(selectors.getSelectedProperty);

  const price = priceProp ?? property?.price;
  const currency = currencyProp ?? property?.currency;
  const priceOnRequest = porProp ?? property?.priceOnRequest;

  if (price == null && !priceOnRequest) return null;
  // The range and period belong to the page's listing; a different price
  // passed in by hand is shown on its own.
  const own = priceProp == null || priceProp === property?.price;

  return (
    <div class="rs-detail-price">
      {formatPropertyPrice(
        {
          price: price as number,
          priceOnRequest: !!priceOnRequest,
          priceTo: own ? property?.priceTo : null,
          rentalPeriod: own ? property?.rentalPeriod : null,
          listingType: property?.listingType ?? 'sale',
        },
        (n) => formatPrice(n, currency!),
        t,
      )}
    </div>
  );
}
