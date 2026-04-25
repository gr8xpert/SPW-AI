import { useCallback } from 'preact/hooks';
import { useSelector } from './useStore';
import { selectors } from '@/core/selectors';
import { actions } from '@/core/actions';

export function useCurrency() {
  const currency = useSelector(selectors.getCurrency);

  const formatPrice = useCallback((amount: number, currencyCode?: string): string => {
    const code = currencyCode || currency.current;
    const converted = convertAmount(amount, currency.base, code, currency.rates);
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: code,
        maximumFractionDigits: 0,
      }).format(converted);
    } catch {
      return `${code} ${converted.toLocaleString()}`;
    }
  }, [currency]);

  const setCurrency = useCallback((code: string) => {
    actions.setCurrency(code);
  }, []);

  return { currency: currency.current, formatPrice, setCurrency };
}

function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>,
): number {
  if (fromCurrency === toCurrency) return amount;
  const fromRate = rates[fromCurrency] ?? 1;
  const toRate = rates[toCurrency] ?? 1;
  return (amount / fromRate) * toRate;
}
