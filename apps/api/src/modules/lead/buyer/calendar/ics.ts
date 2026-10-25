// iCalendar (RFC 5545) for viewings: one event as an email invite or a
// download, and an agent's feed that Google / Outlook / Apple subscribe to.
// Pure; times are written in UTC so no time zone block is needed.

export interface IcsEvent {
  uid: string;
  start: Date;
  durationMin: number;
  title: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  cancelled?: boolean;
  // Last change; calendars use it (with SEQUENCE) to replace an older copy.
  updatedAt?: Date | null;
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// Text values escape \ ; , and newlines.
export function icsText(s: string): string {
  return s.replace(/\r\n?/g, '\n').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// Lines longer than 75 octets continue on the next line after a space,
// never cutting a UTF-8 character in two.
export function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, 'utf8');
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function vevent(e: IcsEvent, now: Date): string[] {
  const end = new Date(e.start.getTime() + Math.max(5, e.durationMin) * 60_000);
  const changed = e.updatedAt ?? now;
  return [
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${utc(now)}`,
    `LAST-MODIFIED:${utc(changed)}`,
    // Seconds since 2020: grows with every change, so a resent invite wins.
    `SEQUENCE:${Math.max(0, Math.floor((changed.getTime() - Date.UTC(2020, 0, 1)) / 1000))}`,
    `DTSTART:${utc(e.start)}`,
    `DTEND:${utc(end)}`,
    `SUMMARY:${icsText(e.title)}`,
    ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
    ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
    ...(e.url && /^https?:\/\/\S+$/i.test(e.url) ? [`URL:${e.url}`] : []),
    `STATUS:${e.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
  ];
}

export function buildIcs(o: { name: string; events: IcsEvent[]; method?: 'PUBLISH' | 'REQUEST'; now?: Date }): string {
  const now = o.now ?? new Date();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Smart Property Manager//Viewings//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${o.method ?? 'PUBLISH'}`,
    `X-WR-CALNAME:${icsText(o.name)}`,
    ...o.events.flatMap((e) => vevent(e, now)),
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
