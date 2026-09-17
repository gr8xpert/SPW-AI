import { useCallback } from 'preact/hooks';
import { useSelector } from './useStore';
import { selectors } from '@/core/selectors';
import { actions } from '@/core/actions';

export function useCurrency() {
  const currency = useSelector(selectors.getCurrency);

  // `sourceCurrency` is the currency the amount is IN (a property's own
  // currency); omitted, the amount is taken to be in the site currency. The
  // result is shown in the visitor's current currency. Without exchange rates
  // for the pair the amount is shown unconverted in its own currency — never
  // relabelled with a symbol it wasn't converted to.
  const formatPrice = useCallback((amount: number, sourceCurrency?: string): string => {
    const source = sourceCurrency || currency.base;
    let code = currency.current;
    let value = amount;
    if (source !== code) {
      const converted = convertAmount(amount, source, code, currency.rates);
      if (converted === null) {
        code = source;
      } else {
        value = converted;
      }
    }
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: code,
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return `${code} ${value.toLocaleString()}`;
    }
  }, [currency]);

  const setCurrency = useCallback((code: string) => {
    actions.setCurrency(code);
  }, []);

  return { currency: currency.current, formatPrice, setCurrency };
}

// Rates are units of each currency per 1 unit of the site's base currency.
function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>,
): number | null {
  if (fromCurrency === toCurrency) return amount;
  const fromRate = rates[fromCurrency];
  const toRate = rates[toCurrency];
  if (!fromRate || !toRate) return null;
  return (amount / fromRate) * toRate;
}
