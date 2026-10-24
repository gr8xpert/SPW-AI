import { escapeHtml } from '../../../../common/security/escape-html';
import { localDayTime } from '../alerts/alert-rules';

// The buyer's itinerary for a trip: an agency cover, then day by day each
// viewing. Printed to PDF with the brochure Puppeteer pool. Pure.

export interface ItineraryViewing {
  startsAt: Date;
  durationMin: number;
  title: string;
  reference: string | null;
  place: string;
  price: string;
  image: string | null;
  meetingPoint: string | null;
  mapUrl: string | null;
}

export interface ItineraryDay {
  day: string;
  label: string;
  items: (ItineraryViewing & { time: string })[];
}

export const ITINERARY_TEXT: Record<string, string> = {
  buyer_trip_title: 'Viewing itinerary for {name}',
  buyer_trip_title_anon: 'Your viewing itinerary',
  buyer_trip_dates: '{from} – {to}',
  buyer_trip_meeting: 'Meeting point',
  buyer_trip_map: 'Map',
  buyer_trip_agent: 'Your agent',
  buyer_trip_empty: 'No viewings planned yet.',
  buyer_trip_notes: 'Notes',
};

export function groupByDay(viewings: ItineraryViewing[], timeZone: string, lang: string): ItineraryDay[] {
  const sorted = [...viewings].sort((a, b) => +a.startsAt - +b.startsAt);
  const days: ItineraryDay[] = [];
  for (const v of sorted) {
    const { day, time } = localDayTime(v.startsAt, timeZone);
    let d = days.find((x) => x.day === day);
    if (!d) {
      d = { day, label: dayLabel(day, lang), items: [] };
      days.push(d);
    }
    d.items.push({ ...v, time });
  }
  return days;
}

// English dates in the British order (3 November): the buyers are mostly in Europe.
const locale = (lang: string) => (lang === 'en' ? 'en-GB' : lang);

export function dayLabel(day: string, lang: string): string {
  const at = new Date(`${day}T12:00:00Z`);
  try {
    return new Intl.DateTimeFormat(locale(lang), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(at);
  } catch {
    return day;
  }
}

function dateText(day: string, lang: string): string {
  try {
    return new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
  } catch {
    return day;
  }
}

export function mapLink(lat: number | string | null | undefined, lng: number | string | null | undefined, place: string | null | undefined): string | null {
  const a = Number(lat);
  const b = Number(lng);
  const query = lat != null && lng != null && Number.isFinite(a) && Number.isFinite(b) && (a !== 0 || b !== 0) ? `${a},${b}` : place?.trim();
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

export function itineraryHtml(args: {
  lang: string;
  labels: Record<string, string>;
  agency: { name: string; logo: string | null; color: string; website: string | null };
  buyerName: string | null;
  trip: { start: string; end: string; notes: string | null };
  agent: { name: string | null; email: string | null } | null;
  days: ItineraryDay[];
}): string {
  const L = (k: string) => args.labels[k] || ITINERARY_TEXT[k];
  const color = /^#[0-9a-f]{3,8}$/i.test(args.agency.color) ? args.agency.color : '#2563eb';
  const title = args.buyerName ? L('buyer_trip_title').replace('{name}', args.buyerName) : L('buyer_trip_title_anon');
  const dates = L('buyer_trip_dates').replace('{from}', dateText(args.trip.start, args.lang)).replace('{to}', dateText(args.trip.end, args.lang));
  const logo = args.agency.logo && /^(https?:|data:image\/)/i.test(args.agency.logo) ? `<img class="logo" src="${escapeHtml(args.agency.logo)}" alt="">` : '';
  const days = args.days
    .map(
      (d) => `<section class="day"><h2>${escapeHtml(d.label)}</h2>${d.items
        .map(
          (i) => `<div class="v">
  <div class="time">${escapeHtml(i.time)}</div>
  ${i.image && /^https?:\/\//i.test(i.image) ? `<img class="ph" src="${escapeHtml(i.image)}" alt="">` : '<div class="ph"></div>'}
  <div class="info"><div class="t">${escapeHtml(i.title)}</div>
  <div class="m">${escapeHtml([i.reference, i.place, i.price].filter(Boolean).join(' · '))}</div>
  ${i.meetingPoint ? `<div class="m"><strong>${escapeHtml(L('buyer_trip_meeting'))}:</strong> ${escapeHtml(i.meetingPoint)}</div>` : ''}
  ${i.mapUrl && /^https:\/\//i.test(i.mapUrl) ? `<div class="m"><a href="${escapeHtml(i.mapUrl)}">${escapeHtml(L('buyer_trip_map'))} →</a></div>` : ''}</div>
</div>`,
        )
        .join('')}</section>`,
    )
    .join('');
  return `<!doctype html><html lang="${escapeHtml(args.lang)}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
@page{size:A4;margin:16mm 14mm}*{box-sizing:border-box}body{font-family:Helvetica,Arial,sans-serif;color:#1e293b;margin:0;font-size:12px}
.cover{border-bottom:4px solid ${color};padding-bottom:14px;margin-bottom:18px}.logo{max-height:48px;max-width:200px;display:block;margin-bottom:12px}
h1{font-size:22px;margin:0 0 4px}.dates{color:#475569;font-size:14px}.agency{color:#475569;margin-top:4px}
.day{break-inside:avoid-page;margin-bottom:16px}h2{font-size:15px;color:${color};margin:0 0 8px;text-transform:capitalize}
.v{display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-top:1px solid #e2e8f0;break-inside:avoid}
.time{width:52px;font-weight:700;font-size:14px}.ph{width:120px;height:80px;object-fit:cover;border-radius:6px;background:#e2e8f0;flex:0 0 auto}
.info{flex:1}.t{font-weight:700;font-size:13px;margin-bottom:2px}.m{color:#475569;margin-top:2px}.m a{color:${color}}
.notes,.agent{margin-top:14px;padding:10px 12px;background:#f1f5f9;border-radius:6px}.empty{color:#64748b}
</style></head><body>
<div class="cover">${logo}<h1>${escapeHtml(title)}</h1><div class="dates">${escapeHtml(dates)}</div><div class="agency">${escapeHtml(args.agency.name)}${args.agency.website ? ` · ${escapeHtml(args.agency.website.replace(/^https?:\/\//, ''))}` : ''}</div></div>
${args.trip.notes ? `<div class="notes"><strong>${escapeHtml(L('buyer_trip_notes'))}:</strong> ${escapeHtml(args.trip.notes)}</div>` : ''}
${days || `<p class="empty">${escapeHtml(L('buyer_trip_empty'))}</p>`}
${args.agent && (args.agent.name || args.agent.email) ? `<div class="agent"><strong>${escapeHtml(L('buyer_trip_agent'))}:</strong> ${escapeHtml([args.agent.name, args.agent.email].filter(Boolean).join(' · '))}</div>` : ''}
</body></html>`;
}
