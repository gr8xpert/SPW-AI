import { createHmac } from 'crypto';
import { bookingLink, bookingToken, leadFromToken, readInvitee, validSchedulingUrl, verifyCalendlySignature } from './calendly';
import { buildIcs, fold, icsText } from './ics';

const sign = (key: string, t: number, body: string) => `t=${t},v1=${createHmac('sha256', key).update(`${t}.${body}`).digest('hex')}`;

describe('verifyCalendlySignature', () => {
  const body = '{"event":"invitee.created"}';
  const now = 1_800_000_000;
  it('accepts a fresh, correct signature', () => {
    expect(verifyCalendlySignature(sign('k1', now - 10, body), body, 'k1', now)).toBe(true);
  });
  it('refuses a wrong key, a changed body, an old timestamp and junk', () => {
    expect(verifyCalendlySignature(sign('k2', now, body), body, 'k1', now)).toBe(false);
    expect(verifyCalendlySignature(sign('k1', now, body), body + ' ', 'k1', now)).toBe(false);
    expect(verifyCalendlySignature(sign('k1', now - 600, body), body, 'k1', now)).toBe(false);
    expect(verifyCalendlySignature('t=abc,v1=zz', body, 'k1', now)).toBe(false);
    expect(verifyCalendlySignature(undefined, body, 'k1', now)).toBe(false);
  });
});

describe('booking token + link', () => {
  it('round-trips per tenant and refuses a forged or foreign token', () => {
    const t = bookingToken('secret', 2, 345);
    expect(t).toMatch(/^spm345x[0-9a-f]{10}$/);
    expect(leadFromToken('secret', 2, t)).toBe(345);
    expect(leadFromToken('secret', 3, t)).toBeNull();
    expect(leadFromToken('secret', 2, t.replace('spm345', 'spm346'))).toBeNull();
    expect(leadFromToken('secret', 2, null)).toBeNull();
  });
  it('only calendly.com pages, prefilled', () => {
    expect(validSchedulingUrl('https://calendly.com/alex/viewing')).toBe(true);
    expect(validSchedulingUrl('http://calendly.com/alex')).toBe(false);
    expect(validSchedulingUrl('https://calendly.com.evil.io/x')).toBe(false);
    expect(validSchedulingUrl('https://calendly.com/')).toBe(false);
    const url = new URL(bookingLink('https://calendly.com/alex/viewing', { name: 'Jan de Vries', email: 'jan@x.nl', token: 'spm1xabcdef0123' }));
    expect(url.searchParams.get('name')).toBe('Jan de Vries');
    expect(url.searchParams.get('email')).toBe('jan@x.nl');
    expect(url.searchParams.get('utm_content')).toBe('spm1xabcdef0123');
  });
});

describe('readInvitee', () => {
  const payload = {
    event: 'invitee.created',
    payload: {
      uri: 'https://api.calendly.com/scheduled_events/E1/invitees/I1',
      email: 'Jan@X.nl',
      name: 'Jan de Vries',
      old_invitee: null,
      rescheduled: false,
      text_reminder_number: '+31 6 1234 5678',
      questions_and_answers: [{ question: 'Budget?', answer: '300k' }, { question: '', answer: 'x' }],
      tracking: { utm_content: 'spm9x0123456789' },
      scheduled_event: {
        name: 'Property viewing',
        start_time: '2026-11-02T10:00:00.000000Z',
        end_time: '2026-11-02T10:45:00.000000Z',
        location: { type: 'physical', location: 'Calle Mayor 1, Marbella' },
        event_memberships: [{ user_email: 'Agent@Agency.com' }],
      },
    },
  };
  it('reads a booking', () => {
    expect(readInvitee(payload)).toMatchObject({
      kind: 'created', email: 'jan@x.nl', name: 'Jan de Vries', durationMin: 45, title: 'Property viewing',
      hostEmails: ['agent@agency.com'], location: 'Calle Mayor 1, Marbella', token: 'spm9x0123456789', phone: '+31 6 1234 5678',
      answers: [{ question: 'Budget?', answer: '300k' }],
    });
  });
  it('reads a cancel and ignores other events or broken payloads', () => {
    const c = readInvitee({ ...payload, event: 'invitee.canceled', payload: { ...payload.payload, rescheduled: true, cancellation: { reason: 'Conflict' } } });
    expect(c).toMatchObject({ kind: 'canceled', rescheduled: true, cancelReason: 'Conflict' });
    expect(readInvitee({ ...payload, event: 'routing_form_submission.created' })).toBeNull();
    expect(readInvitee({ event: 'invitee.created', payload: { ...payload.payload, email: 'nope' } })).toBeNull();
    expect(readInvitee(null)).toBeNull();
  });
});

describe('ics', () => {
  it('escapes text and folds long lines at 75 octets', () => {
    expect(icsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
    const long = fold(`SUMMARY:${'é'.repeat(60)}`);
    for (const line of long.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
  });
  it('builds a calendar with UTC times and a cancelled event', () => {
    const ics = buildIcs({
      name: 'Viewings',
      now: new Date('2026-10-25T12:00:00Z'),
      events: [
        { uid: 'v1@spm', start: new Date('2026-11-02T10:00:00Z'), durationMin: 45, title: 'Viewing, Villa', location: 'Marbella' },
        { uid: 'v2@spm', start: new Date('2026-11-03T10:00:00Z'), durationMin: 60, title: 'Old', cancelled: true },
      ],
    });
    expect(ics).toContain('DTSTART:20261102T100000Z\r\nDTEND:20261102T104500Z');
    expect(ics).toContain('SUMMARY:Viewing\\, Villa');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
