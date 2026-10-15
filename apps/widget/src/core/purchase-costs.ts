// Purchase costs in Spain (Dashboard → Settings → Widget → Purchase costs
// calculator). Every rate is a percentage of the price; the defaults are
// Andalucía's. The client can change them, since other regions differ.
import type { Property } from '@/types';

export interface PurchaseCostRates {
  newVat: number;              // New build: VAT (IVA)
  newStampDuty: number;        // New build: stamp duty (AJD)
  resaleTransferTax: number;   // Resale: transfer tax (ITP)
  plotPrivateTransferTax: number; // Plot sold by a private individual: ITP
  plotCompanyVat: number;      // Plot sold by a company: VAT
  plotCompanyStampDuty: number; // Plot sold by a company: AJD
  lawyerFee: number;
  notaryFee: number;           // Notary + Land Registry
}

export interface PurchaseCostsConfig extends Partial<PurchaseCostRates> {
  // A page holding the calculator block: the property page's button links
  // there (?price=…&type=…). Empty: the button opens it in a popup.
  pageUrl?: string;
}

export const DEFAULT_RATES: PurchaseCostRates = {
  newVat: 10,
  newStampDuty: 1.2,
  resaleTransferTax: 7,
  plotPrivateTransferTax: 7,
  plotCompanyVat: 21,
  plotCompanyStampDuty: 1.2,
  lawyerFee: 0.8,
  notaryFee: 0.5,
};

export type PurchaseType = 'new' | 'resale' | 'plot';
export type PlotSeller = 'private' | 'company';

export function ratesFrom(config?: PurchaseCostsConfig): PurchaseCostRates {
  const out = { ...DEFAULT_RATES };
  if (!config) return out;
  for (const key of Object.keys(DEFAULT_RATES) as (keyof PurchaseCostRates)[]) {
    const v = Number(config[key]);
    if (config[key] != null && Number.isFinite(v) && v >= 0 && v <= 30) out[key] = v;
  }
  return out;
}

export interface CostLine {
  key: 'vat' | 'transfer_tax' | 'stamp_duty' | 'lawyer' | 'notary';
  rate: number;
  amount: number;
}

/** The lines (only those with a rate above 0) and the total with the price. */
export function computeCosts(price: number, type: PurchaseType, seller: PlotSeller, r: PurchaseCostRates): { lines: CostLine[]; costs: number; total: number } {
  const p = Number.isFinite(price) && price > 0 ? price : 0;
  const tax: [CostLine['key'], number][] =
    type === 'new' ? [['vat', r.newVat], ['stamp_duty', r.newStampDuty]]
    : type === 'resale' ? [['transfer_tax', r.resaleTransferTax]]
    : seller === 'company' ? [['vat', r.plotCompanyVat], ['stamp_duty', r.plotCompanyStampDuty]]
    : [['transfer_tax', r.plotPrivateTransferTax]];
  const lines: CostLine[] = [...tax, ['lawyer', r.lawyerFee] as [CostLine['key'], number], ['notary', r.notaryFee] as [CostLine['key'], number]]
    .filter(([, rate]) => rate > 0)
    .map(([key, rate]) => ({ key, rate, amount: Math.round((p * rate) / 100) }));
  const costs = lines.reduce((sum, l) => sum + l.amount, 0);
  return { lines, costs, total: p + costs };
}

const PLOT_RE = /\b(plot|plots|land|terreno|terrenos|parcela|parcelas|solar|solares|grundst|terrain|kavel|tomt)/i;

/** New build for developments and off-plan, plot for land types, else resale. */
export function purchaseTypeOf(property?: Pick<Property, 'listingType' | 'propertyType'> | null): PurchaseType {
  if (!property) return 'resale';
  const typeName = `${property.propertyType?.slug ?? ''} ${property.propertyType?.name ?? ''}`;
  if (PLOT_RE.test(typeName)) return 'plot';
  const lt = String(property.listingType);
  if (lt === 'development' || lt === 'offplan') return 'new';
  return 'resale';
}

/** The calculator page's address for one property; '' when it is not a web
 *  page (the button then opens the popup instead). */
export function calculatorUrl(pageUrl: string, price: number, type: PurchaseType): string {
  try {
    const url = new URL(pageUrl, window.location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    url.searchParams.set('price', String(Math.round(price)));
    url.searchParams.set('type', type);
    return url.toString();
  } catch {
    return '';
  }
}
