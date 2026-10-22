'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useSettingsText } from '../_i18n';

// Purchase costs calculator (Settings → Widget). Rates are % of the price;
// an empty box uses the default shown as its placeholder (Andalucía).
export interface PurchaseCostsForm {
  enabled: boolean;
  pageUrl: string;
  rates: Record<PurchaseCostRateKey, string>;
}

export type PurchaseCostRateKey =
  | 'newVat' | 'newStampDuty' | 'resaleTransferTax' | 'plotPrivateTransferTax'
  | 'plotCompanyVat' | 'plotCompanyStampDuty' | 'lawyerFee' | 'notaryFee';

// Labels: settingsText purchaseCosts.fields[key].
export const PURCHASE_COST_FIELDS: { key: PurchaseCostRateKey; fallback: number }[] = [
  { key: 'newVat', fallback: 10 },
  { key: 'newStampDuty', fallback: 1.2 },
  { key: 'resaleTransferTax', fallback: 7 },
  { key: 'plotPrivateTransferTax', fallback: 7 },
  { key: 'plotCompanyVat', fallback: 21 },
  { key: 'plotCompanyStampDuty', fallback: 1.2 },
  { key: 'lawyerFee', fallback: 0.8 },
  { key: 'notaryFee', fallback: 0.5 },
];

export const EMPTY_PURCHASE_COSTS: PurchaseCostsForm = {
  enabled: false,
  pageUrl: '',
  rates: Object.fromEntries(PURCHASE_COST_FIELDS.map((f) => [f.key, ''])) as Record<PurchaseCostRateKey, string>,
};

export function purchaseCostsFromSettings(value: unknown): PurchaseCostsForm {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    enabled: v.enabled === true,
    pageUrl: typeof v.pageUrl === 'string' ? v.pageUrl : '',
    rates: Object.fromEntries(
      PURCHASE_COST_FIELDS.map((f) => [f.key, typeof v[f.key] === 'number' ? String(v[f.key]) : '']),
    ) as Record<PurchaseCostRateKey, string>,
  };
}

/** What is saved: null clears a rate (back to the default). */
export function purchaseCostsToSettings(form: PurchaseCostsForm) {
  const rates = Object.fromEntries(
    PURCHASE_COST_FIELDS.map((f) => {
      const raw = form.rates[f.key].trim().replace(',', '.');
      const n = Number(raw);
      return [f.key, raw !== '' && Number.isFinite(n) && n >= 0 && n <= 30 ? n : null];
    }),
  );
  return { enabled: form.enabled, pageUrl: form.pageUrl.trim(), ...rates };
}

export function PurchaseCostsSettings({ value, onChange }: { value: PurchaseCostsForm; onChange: (v: PurchaseCostsForm) => void }) {
  const t = useSettingsText().purchaseCosts;
  const page = value.pageUrl.trim();
  const pageOk = !page || /^(https?:\/\/\S+|\/(?!\/)\S*)$/i.test(page);
  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="purchase-costs-enabled">{t.title}</Label>
          <p className="text-xs text-muted-foreground">{t.help}</p>
        </div>
        <Switch id="purchase-costs-enabled" checked={value.enabled} onCheckedChange={(enabled) => onChange({ ...value, enabled })} />
      </div>

      {value.enabled && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {PURCHASE_COST_FIELDS.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-3">
                <Label htmlFor={`pc-${f.key}`} className="text-sm font-normal">{t.fields[f.key]} (%)</Label>
                <Input
                  id={`pc-${f.key}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={30}
                  step={0.01}
                  placeholder={String(f.fallback)}
                  value={value.rates[f.key]}
                  onChange={(e) => onChange({ ...value, rates: { ...value.rates, [f.key]: e.target.value } })}
                  className="w-24"
                />
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <Label htmlFor="purchase-costs-page">{t.page}</Label>
            <Input
              id="purchase-costs-page"
              placeholder={t.pagePlaceholder}
              value={value.pageUrl}
              onChange={(e) => onChange({ ...value, pageUrl: e.target.value })}
              className="max-w-xl"
            />
            <p className="text-xs text-muted-foreground">
              {t.pageHelp} <code>[spm block=&quot;purchase_costs&quot;]</code> {t.pageHelpOr}{' '}
              <code>&lt;div data-spm-widget=&quot;purchase_costs&quot;&gt;&lt;/div&gt;</code>.
            </p>
            {!pageOk && (
              <p className="text-xs text-destructive">
                {t.pageInvalid}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
