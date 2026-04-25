import { useCallback } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useCurrency } from '@/hooks/useCurrency';

interface Props {
  currencies?: string[];
  [key: string]: unknown;
}

const DEFAULT_CURRENCIES = ['EUR', 'GBP', 'USD', 'CHF', 'SEK', 'NOK', 'DKK'];

export default function RsCurrencySelector({ currencies }: Props) {
  const { t } = useLabels();
  const { currency, setCurrency } = useCurrency();
  const availableCurrencies = currencies ?? DEFAULT_CURRENCIES;

  const handleChange = useCallback(
    (e: Event) => {
      setCurrency((e.target as HTMLSelectElement).value);
    },
    [setCurrency],
  );

  return (
    <div class="rs-selector">
      <label class="rs-field__label">
        {t('currency_label', 'Currency')}
      </label>
      <select class="rs-select" value={currency} onChange={handleChange}>
        {availableCurrencies.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
    </div>
  );
}
