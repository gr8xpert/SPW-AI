import { alertAllowed, alertDedupeKey, digestDue, localDayTime, priceDropOf } from './alert-rules';

describe('priceDropOf', () => {
  it('is a drop of at least the threshold', () => {
    expect(priceDropOf(400000, 380000, 5)).toEqual({ oldPrice: 400000, newPrice: 380000, percent: 5 });
    expect(priceDropOf('400000.00', '360000.00', 5)).toEqual({ oldPrice: 400000, newPrice: 360000, percent: 10 });
  });

  it('a smaller cut, a rise or no price is not', () => {
    expect(priceDropOf(400000, 390000, 5)).toBeNull();
    expect(priceDropOf(400000, 420000, 5)).toBeNull();
    expect(priceDropOf(null, 300000, 5)).toBeNull();
    expect(priceDropOf(400000, 0, 5)).toBeNull();
    expect(priceDropOf(0, 100, 5)).toBeNull();
  });
});

describe('alertDedupeKey', () => {
  it('a new listing once per buyer; a price drop once per new price', () => {
    expect(alertDedupeKey(7, 99, 'new_listing')).toBe('7:99:new_listing');
    expect(alertDedupeKey(7, 99, 'price_drop', 380000)).toBe('7:99:price_drop:380000');
    expect(alertDedupeKey(7, 99, 'price_drop', '380000.00')).toBe('7:99:price_drop:380000');
  });
});

describe('alertAllowed', () => {
  const none = null;
  const sent = { sentAt: new Date(), rejectedAt: null, status: 'sent' };
  const rejected = { sentAt: new Date(), rejectedAt: new Date(), status: 'not_interested' };
  const suggested = { sentAt: null, rejectedAt: null, status: 'suggested' };

  it('new listing: only to buyers who never had it', () => {
    expect(alertAllowed('new_listing', none)).toBe(true);
    expect(alertAllowed('new_listing', suggested)).toBe(true);
    expect(alertAllowed('new_listing', sent)).toBe(false);
    expect(alertAllowed('new_listing', rejected)).toBe(false);
  });

  it('price drop: news even if sent before, never after a rejection', () => {
    expect(alertAllowed('price_drop', none)).toBe(true);
    expect(alertAllowed('price_drop', sent)).toBe(true);
    expect(alertAllowed('price_drop', rejected)).toBe(false);
    expect(alertAllowed('price_drop', { sentAt: null, rejectedAt: null, status: 'not_interested' })).toBe(false);
  });
});

describe('localDayTime / digestDue', () => {
  it('reads the day and time in the agency time zone', () => {
    const at = new Date('2026-10-22T06:30:00Z');
    expect(localDayTime(at, 'Europe/Madrid')).toEqual({ day: '2026-10-22', time: '08:30' });
    expect(localDayTime(at, 'America/New_York')).toEqual({ day: '2026-10-22', time: '02:30' });
    expect(localDayTime(new Date('2026-10-22T23:30:00Z'), 'Asia/Karachi')).toEqual({ day: '2026-10-23', time: '04:30' });
  });

  it('falls back to UTC for an unknown zone', () => {
    expect(localDayTime(new Date('2026-10-22T06:30:00Z'), 'Mars/Base')).toEqual({ day: '2026-10-22', time: '06:30' });
  });

  it('is due at or after the digest time', () => {
    expect(digestDue(new Date('2026-10-22T05:59:00Z'), 'Europe/Madrid', '08:00')).toEqual({ due: false, day: '2026-10-22' });
    expect(digestDue(new Date('2026-10-22T06:00:00Z'), 'Europe/Madrid', '08:00')).toEqual({ due: true, day: '2026-10-22' });
    expect(digestDue(new Date('2026-10-22T21:00:00Z'), 'Europe/Madrid', '08:00')).toEqual({ due: true, day: '2026-10-22' });
  });
});
