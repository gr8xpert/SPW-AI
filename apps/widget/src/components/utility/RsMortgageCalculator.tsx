import { useState, useMemo } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useCurrency } from '@/hooks/useCurrency';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

interface Props {
  price?: number;
  currency?: string;
}

export default function RsMortgageCalculator({ price: priceProp, currency: currencyProp }: Props) {
  const { t } = useLabels();
  const { formatPrice } = useCurrency();
  const property = useSelector(selectors.getSelectedProperty);

  const price = priceProp ?? property?.price ?? 0;
  const currency = currencyProp ?? property?.currency ?? 'EUR';

  if (!price || price <= 0) return null;

  const [downPaymentPct, setDownPaymentPct] = useState(20);
  const [interestRate, setInterestRate] = useState(3.5);
  const [years, setYears] = useState(25);

  const monthlyPayment = useMemo(() => {
    const principal = price * (1 - downPaymentPct / 100);
    if (principal <= 0 || years <= 0) return 0;

    const monthlyRate = interestRate / 100 / 12;
    const numPayments = years * 12;

    if (monthlyRate === 0) {
      return principal / numPayments;
    }

    return (
      (principal * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
      (Math.pow(1 + monthlyRate, numPayments) - 1)
    );
  }, [price, downPaymentPct, interestRate, years]);

  return (
    <div class="rs-mortgage-calc">
      <h3 class="rs-mortgage-calc__heading">
        {t('mortgage_title', 'Mortgage Calculator')}
      </h3>

      <div class="rs-mortgage-calc__fields">
        <div class="rs-field">
          <label class="rs-field__label">
            {t('mortgage_price', 'Property Price')}
          </label>
          <input
            class="rs-input"
            type="text"
            value={formatPrice(price, currency)}
            disabled
          />
        </div>

        <div class="rs-field">
          <label class="rs-field__label">
            {t('mortgage_down_payment', 'Down Payment')} (%)
          </label>
          <input
            class="rs-input"
            type="number"
            min={0}
            max={100}
            step={1}
            value={downPaymentPct}
            onInput={(e) =>
              setDownPaymentPct(Number((e.target as HTMLInputElement).value))
            }
          />
        </div>

        <div class="rs-field">
          <label class="rs-field__label">
            {t('mortgage_interest', 'Interest Rate')} (%)
          </label>
          <input
            class="rs-input"
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={interestRate}
            onInput={(e) =>
              setInterestRate(Number((e.target as HTMLInputElement).value))
            }
          />
        </div>

        <div class="rs-field">
          <label class="rs-field__label">
            {t('mortgage_years', 'Loan Term')} ({t('mortgage_years', 'Years')})
          </label>
          <input
            class="rs-input"
            type="number"
            min={1}
            max={50}
            step={1}
            value={years}
            onInput={(e) =>
              setYears(Number((e.target as HTMLInputElement).value))
            }
          />
        </div>
      </div>

      <div class="rs-mortgage-calc__result">
        <span class="rs-mortgage-calc__result-label">
          {t('mortgage_monthly', 'Monthly Payment')}
        </span>
        <span class="rs-mortgage-calc__result-value">
          {formatPrice(Math.round(monthlyPayment), currency)}
        </span>
      </div>
    </div>
  );
}
