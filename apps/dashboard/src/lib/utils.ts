import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { PropertySource } from '@spm/shared';

// Display names for properties.source, worded as on the Feeds page. Keyed by
// the shared PropertySource type so a new feed provider fails the type check
// here until it has a label (and a Source filter option on Properties).
export const PROPERTY_SOURCE_LABELS: Record<PropertySource, string> = {
  manual: 'Manual',
  resales: 'Resales Online',
  inmoba: 'Inmoba',
  infocasa: 'Infocasa',
  redsp: 'REDSP',
  kyero: 'Kyero',
  odoo: 'Odoo CRM',
};

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Prices shown to clients: thousands separated, no decimals for whole amounts
// ("EUR 2,625"), cents only when there are some ("EUR 57.50") so a real
// per-hour price is never rounded. Keeps the "EUR 75" code prefix the credit
// pages use rather than a currency symbol.
export function formatMoney(amount: number | string | null | undefined, currency = 'EUR'): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount ?? 0;
  if (!Number.isFinite(value)) return `${currency} 0`;
  const whole = Math.round(value * 100) % 100 === 0;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(value);
  return `${currency} ${formatted}`;
}

export function formatCurrency(
  amount: number,
  currency: string = 'EUR',
  locale: string = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// DECIMAL columns reach the dashboard as strings ("120.00", "450000.00"),
// so showing them raw prints the trailing zeros. Drops those while keeping a
// real fraction ("120.5"). Null for missing or unparsable values so callers
// can hide the row.
export function formatDecimal(
  value: number | string | null | undefined,
  maxFractionDigits = 2,
): string | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: maxFractionDigits }).format(n);
}

// Fees and taxes: like formatCurrency, but cents are kept when there are
// some — a EUR 85.50 community fee must not show as EUR 86.
export function formatAmount(
  amount: number | string,
  currency: string = 'EUR',
  locale: string = 'en-US',
): string {
  const n = Number(amount);
  const whole = Math.round(n * 100) % 100 === 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(n);
}

// A property price counts as set only when it is above zero. The column is a
// DECIMAL, so an empty price arrives as "0.00" — a truthy string — and feeds
// send 0 for price-on-application listings.
export function hasPrice(value: number | string | null | undefined): value is number | string {
  if (value == null || value === '') return false;
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

export function formatDate(
  date: string | Date,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }
): string {
  return new Date(date).toLocaleDateString('en-US', options);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
