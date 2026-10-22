// New-listing alerts: the rules, pure. See buyer-alert.service.ts.

export type AlertKind = 'new_listing' | 'price_drop';

function money(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// A price cut of at least `percent` % (whole percent, rounded down).
export function priceDropOf(oldPrice: unknown, newPrice: unknown, percent: number): { oldPrice: number; newPrice: number; percent: number } | null {
  const o = money(oldPrice);
  const n = money(newPrice);
  if (o === null || n === null || n >= o) return null;
  const pct = ((o - n) / o) * 100;
  if (pct + 1e-9 < percent) return null;
  return { oldPrice: o, newPrice: n, percent: Math.floor(pct + 1e-9) };
}

// One alert per buyer, listing and event: a new listing once, a price drop
// once per new price.
export function alertDedupeKey(leadId: number, propertyId: number, kind: AlertKind, newPrice?: unknown): string {
  return kind === 'price_drop' ? `${leadId}:${propertyId}:${kind}:${Math.round(Number(newPrice) || 0)}` : `${leadId}:${propertyId}:${kind}`;
}

// Never send twice: a new listing only to buyers who never had it; a price
// drop is news even for one sent before, but never after a rejection.
export function alertAllowed(
  kind: AlertKind,
  suggestion: { sentAt: Date | string | null; rejectedAt: Date | string | null; status: string } | null,
): boolean {
  if (!suggestion) return true;
  const rejected = !!suggestion.rejectedAt || suggestion.status === 'not_interested';
  if (rejected) return false;
  return kind === 'price_drop' || !suggestion.sentAt;
}

// The calendar day and HH:MM in a time zone (UTC when unknown).
export function localDayTime(at: Date, timeZone: string): { day: string; time: string } {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(at)
      .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  let parts: Record<string, string>;
  try {
    parts = fmt(timeZone || 'UTC');
  } catch {
    parts = fmt('UTC');
  }
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

// Today's digest is due once the agency's local time reaches digestTime.
export function digestDue(at: Date, timeZone: string, digestTime: string): { due: boolean; day: string } {
  const { day, time } = localDayTime(at, timeZone);
  return { due: time >= digestTime, day };
}
