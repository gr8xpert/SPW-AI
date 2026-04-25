import { useLabels } from '@/hooks/useLabels';
import { useCurrency } from '@/hooks/useCurrency';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

interface Props {
  price?: number;
  currency?: string;
  priceOnRequest?: boolean;
}

export default function RsDetailPrice({ price: priceProp, currency: currencyProp, priceOnRequest: porProp }: Props) {
  const { t } = useLabels();
  const { formatPrice } = useCurrency();
  const property = useSelector(selectors.getSelectedProperty);

  const price = priceProp ?? property?.price;
  const currency = currencyProp ?? property?.currency;
  const priceOnRequest = porProp ?? property?.priceOnRequest;

  if (price == null && !priceOnRequest) return null;

  return (
    <div class="rs-detail-price">
      {priceOnRequest
        ? t('price_on_request', 'Price on Request')
        : formatPrice(price!, currency!)}
    </div>
  );
}
