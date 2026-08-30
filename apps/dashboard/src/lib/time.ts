// Time-tracking is stored as DECIMAL hours in the DB (TimeEntry.hours) and
// consumed against tenant credit balance in the same unit, so we keep decimal
// as the wire format. These helpers only change how the value is *shown* and
// *entered*, converting to/from hours + minutes for the UI.
//
// Rounding to whole minutes at conversion time prevents floating-point drift
// (e.g. 0.1h + 0.1h = 0.2h but stored decimals accumulate error over many
// entries); rendering "6m" instead of "0.10000000149h" is the point.

export interface HoursMinutes {
  h: number;
  m: number;
}

export function decimalToHM(decimal: number | string | null | undefined): HoursMinutes {
  const value = typeof decimal === 'string' ? parseFloat(decimal) : decimal ?? 0;
  if (!Number.isFinite(value) || value < 0) return { h: 0, m: 0 };
  const totalMinutes = Math.round(value * 60);
  return { h: Math.floor(totalMinutes / 60), m: totalMinutes % 60 };
}

export function hmToDecimal(h: number, m: number): number {
  const hours = Number.isFinite(h) && h >= 0 ? h : 0;
  const minutes = Number.isFinite(m) && m >= 0 ? m : 0;
  return hours + minutes / 60;
}

// "0m" | "45m" | "2h" | "1h 15m" — omits zero segments so the numbers read fast.
export function formatHM(decimal: number | string | null | undefined): string {
  const { h, m } = decimalToHM(decimal);
  if (h === 0 && m === 0) return '0m';
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
