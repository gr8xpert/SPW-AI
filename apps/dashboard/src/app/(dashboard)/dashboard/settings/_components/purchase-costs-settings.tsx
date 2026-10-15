'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

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

export const PURCHASE_COST_FIELDS: { key: PurchaseCostRateKey; label: string; fallback: number }[] = [
  { key: 'newVat', label: 'New build: VAT (IVA)', fallback: 10 },
  { key: 'newStampDuty', label: 'New build: stamp duty (AJD)', fallback: 1.2 },
  { key: 'resaleTransferTax', label: 'Resale: transfer tax (ITP)', fallback: 7 },
  { key: 'plotPrivateTransferTax', label: 'Plot from a private seller: ITP', fallback: 7 },
  { key: 'plotCompanyVat', label: 'Plot from a company: VAT', fallback: 21 },
  { key: 'plotCompanyStampDuty', label: 'Plot from a company: AJD', fallback: 1.2 },
  { key: 'lawyerFee', label: 'Lawyer fees', fallback: 0.8 },
  { key: 'notaryFee', label: 'Notary and Land Registry', fallback: 0.5 },
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
  const page = value.pageUrl.trim();
  const pageOk = !page || /^(https?:\/\/\S+|\/\S*)$/i.test(page);
  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="purchase-costs-enabled">Purchase costs calculator</Label>
          <p className="text-xs text-muted-foreground">
            Adds a &quot;Calculate purchasing costs&quot; button to the property page of every listing for sale. It works
            out the taxes (VAT, stamp duty or transfer tax), lawyer and notary fees and the total from the price. The
            figures below are percentages of the price; empty boxes use the Andalucía rates shown.
          </p>
        </div>
        <Switch id="purchase-costs-enabled" checked={value.enabled} onCheckedChange={(enabled) => onChange({ ...value, enabled })} />
      </div>

      {value.enabled && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {PURCHASE_COST_FIELDS.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-3">
                <Label htmlFor={`pc-${f.key}`} className="text-sm font-normal">{f.label} (%)</Label>
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
            <Label htmlFor="purchase-costs-page">Calculator page (optional)</Label>
            <Input
              id="purchase-costs-page"
              placeholder="/purchase-costs/  or  https://your-site.com/purchase-costs/"
              value={value.pageUrl}
              onChange={(e) => onChange({ ...value, pageUrl: e.target.value })}
              className="max-w-xl"
            />
            <p className="text-xs text-muted-foreground">
              Empty: the button opens the calculator in a popup. With a page: the button opens that page with the
              price filled in. Put the calculator on it with <code>[spm block=&quot;purchase_costs&quot;]</code> (WordPress)
              or <code>&lt;div data-spm-widget=&quot;purchase_costs&quot;&gt;&lt;/div&gt;</code>.
            </p>
            {!pageOk && (
              <p className="text-xs text-destructive">
                Use a full address starting with https:// or a path starting with /. Until then the popup is used.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
