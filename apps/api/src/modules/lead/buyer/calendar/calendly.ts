import { createHmac, timingSafeEqual } from 'crypto';

// Calendly (2026-10-25), pure helpers: the webhook signature, the booking
// link an agent sends (prefilled, carrying a signed lead token) and the
// invitee payload read into a booking.

// Calendly-Webhook-Signature: "t=<unix seconds>,v1=<hex HMAC-SHA256 of `${t}.${body}`>".
// Older than `toleranceS` = a replay, refused.
export function verifyCalendlySignature(header: string | undefined, rawBody: string, key: string, nowS = Math.floor(Date.now() / 1000), toleranceS = 180): boolean {
  if (!header || !key) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isInteger(t) || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  if (Math.abs(nowS - t) > toleranceS) return false;
  const expected = createHmac('sha256', key).update(`${t}.${rawBody}`, 'utf8').digest();
  const got = Buffer.from(v1, 'hex');
  return got.length === expected.length && timingSafeEqual(got, expected);
}

// "spm<leadId>x<10 hex>": which lead a booking belongs to, even when the
// buyer books with another email. Signed per tenant so nobody can attach a
// booking to someone else's lead.
export function bookingToken(secret: string, tenantId: number, leadId: number): string {
  const sig = createHmac('sha256', secret).update(`calendly:${tenantId}:${leadId}`).digest('hex').slice(0, 10);
  return `spm${leadId}x${sig}`;
}

export function leadFromToken(secret: string, tenantId: number, token: string | null | undefined): number | null {
  const m = /^spm(\d{1,10})x[0-9a-f]{10}$/.exec(String(token ?? '').trim());
  if (!m) return null;
  const leadId = Number(m[1]);
  const want = bookingToken(secret, tenantId, leadId);
  return want.length === token!.trim().length && timingSafeEqual(Buffer.from(want), Buffer.from(token!.trim())) ? leadId : null;
}

// Only a calendly.com booking page is ever sent to a buyer.
export function validSchedulingUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 500) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'calendly.com' || u.hostname.endsWith('.calendly.com')) && u.pathname.length > 1;
  } catch {
    return false;
  }
}

// The agent's booking page with the buyer's name and email filled in.
export function bookingLink(schedulingUrl: string, o: { name?: string | null; email?: string | null; token: string }): string {
  const u = new URL(schedulingUrl);
  if (o.name?.trim()) u.searchParams.set('name', o.name.trim());
  if (o.email?.trim()) u.searchParams.set('email', o.email.trim());
  u.searchParams.set('utm_source', 'spm');
  u.searchParams.set('utm_content', o.token);
  return u.toString();
}

export interface CalendlyBooking {
  kind: 'created' | 'canceled';
  inviteeUri: string;
  // Set on the new booking of a reschedule: the booking it replaces.
  oldInviteeUri: string | null;
  // A cancel that is really a reschedule (a 'created' follows).
  rescheduled: boolean;
  email: string;
  name: string | null;
  phone: string | null;
  startsAt: Date;
  durationMin: number;
  title: string;
  hostEmails: string[];
  location: string | null;
  token: string | null;
  answers: { question: string; answer: string }[];
  cancelReason: string | null;
}

const str = (v: unknown, max = 500): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Where they meet: an address, a phone number or a video link.
function placeOf(loc: unknown): string | null {
  if (!loc || typeof loc !== 'object') return null;
  const l = loc as Record<string, unknown>;
  return str(l.location) || str(l.join_url) || str(l.phone_number) || null;
}

// The webhook body → a booking, or null for anything else (other events,
// a broken payload).
export function readInvitee(body: unknown): CalendlyBooking | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as { event?: unknown; payload?: Record<string, unknown> };
  const kind = b.event === 'invitee.created' ? 'created' : b.event === 'invitee.canceled' ? 'canceled' : null;
  const p = b.payload;
  if (!kind || !p || typeof p !== 'object') return null;
  const ev = (p.scheduled_event ?? {}) as Record<string, unknown>;
  const inviteeUri = str(p.uri, 255);
  const email = str(p.email, 255)?.toLowerCase() ?? null;
  const start = new Date(String(ev.start_time ?? ''));
  const end = new Date(String(ev.end_time ?? ''));
  if (!inviteeUri || !email || !EMAIL.test(email) || Number.isNaN(+start)) return null;
  const minutes = Number.isNaN(+end) ? 60 : Math.round((+end - +start) / 60_000);
  const tracking = (p.tracking ?? {}) as Record<string, unknown>;
  const qa = Array.isArray(p.questions_and_answers) ? p.questions_and_answers : [];
  const cancellation = (p.cancellation ?? {}) as Record<string, unknown>;
  const name = str(p.name, 200) || [str(p.first_name, 100), str(p.last_name, 100)].filter(Boolean).join(' ') || null;
  return {
    kind,
    inviteeUri,
    oldInviteeUri: str(p.old_invitee, 255),
    rescheduled: p.rescheduled === true,
    email,
    name,
    phone: str(p.text_reminder_number, 50),
    startsAt: start,
    durationMin: Math.min(600, Math.max(5, minutes || 60)),
    title: str(ev.name, 255) || 'Calendly',
    hostEmails: (Array.isArray(ev.event_memberships) ? ev.event_memberships : [])
      .map((m) => str((m as Record<string, unknown>)?.user_email, 255)?.toLowerCase())
      .filter((e): e is string => !!e),
    location: placeOf(ev.location),
    token: str(tracking.utm_content, 40),
    answers: qa
      .map((x) => ({ question: str((x as Record<string, unknown>)?.question, 300) ?? '', answer: str((x as Record<string, unknown>)?.answer, 1000) ?? '' }))
      .filter((x) => x.question && x.answer),
    cancelReason: str(cancellation.reason, 500),
  };
}
