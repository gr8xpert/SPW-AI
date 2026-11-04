// Feed Export logs read in Spain time for everyone, wherever the viewer is.
export function spainDateTime(value: string | Date, locale: string): string {
  return new Date(value).toLocaleString(locale, { timeZone: 'Europe/Madrid' });
}

export function spainDate(value: string | Date, locale: string): string {
  return new Date(value).toLocaleDateString(locale, { timeZone: 'Europe/Madrid' });
}
