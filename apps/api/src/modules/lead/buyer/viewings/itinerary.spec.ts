import { groupByDay, itineraryHtml, mapLink, type ItineraryViewing } from './itinerary';

const v = (iso: string, title: string, extra: Partial<ItineraryViewing> = {}): ItineraryViewing => ({
  startsAt: new Date(iso),
  durationMin: 60,
  title,
  reference: 'R1',
  place: 'Marbella',
  price: '€450,000',
  image: null,
  meetingPoint: null,
  mapUrl: null,
  ...extra,
});

describe('groupByDay', () => {
  it('groups by the day in the agency time zone, in time order', () => {
    const days = groupByDay([v('2026-11-03T16:00:00Z', 'B'), v('2026-11-03T08:30:00Z', 'A'), v('2026-11-03T23:30:00Z', 'C')], 'Europe/Madrid', 'en');
    expect(days.map((d) => d.day)).toEqual(['2026-11-03', '2026-11-04']);
    expect(days[0].items.map((i) => `${i.time} ${i.title}`)).toEqual(['09:30 A', '17:00 B']);
    expect(days[1].items[0].time).toBe('00:30');
    expect(days[0].label).toBe('Tuesday 3 November');
  });

  it('day names in the buyer language', () => {
    expect(groupByDay([v('2026-11-03T10:00:00Z', 'A')], 'UTC', 'es')[0].label).toMatch(/martes/i);
  });
});

describe('mapLink', () => {
  it('coordinates first, else the place name, else nothing', () => {
    expect(mapLink(36.51, -4.88, 'Marbella')).toBe('https://www.google.com/maps/search/?api=1&query=36.51%2C-4.88');
    expect(mapLink(null, null, 'Nueva Andalucía, Marbella')).toBe('https://www.google.com/maps/search/?api=1&query=Nueva%20Andaluc%C3%ADa%2C%20Marbella');
    expect(mapLink(null, null, '')).toBeNull();
  });
});

describe('itineraryHtml', () => {
  const html = itineraryHtml({
    lang: 'en',
    labels: {},
    agency: { name: 'Costa <Homes>', logo: null, color: '#123456', website: 'https://costa.example' },
    buyerName: 'Ann',
    trip: { start: '2026-11-03', end: '2026-11-05', notes: 'Arrives Tuesday <late>' },
    agent: { name: 'Alex', email: 'alex@costa.example' },
    days: groupByDay([v('2026-11-03T09:00:00Z', 'Sea view villa', { meetingPoint: 'Our office', mapUrl: 'https://maps.example/x', image: 'https://cdn.example/1.jpg' })], 'UTC', 'en'),
  });

  it('has the cover, the dates and each viewing', () => {
    expect(html).toContain('Viewing itinerary for Ann');
    expect(html).toContain('3 November');
    expect(html).toContain('09:00');
    expect(html).toContain('Sea view villa');
    expect(html).toContain('Our office');
    expect(html).toContain('href="https://maps.example/x"');
    expect(html).toContain('alex@costa.example');
  });

  it('escapes every text', () => {
    expect(html).not.toContain('<Homes>');
    expect(html).toContain('Costa &lt;Homes&gt;');
    expect(html).toContain('Arrives Tuesday &lt;late&gt;');
  });

  it('says when there are no viewings yet', () => {
    expect(itineraryHtml({ lang: 'en', labels: {}, agency: { name: 'X', logo: null, color: '#000', website: null }, buyerName: null, trip: { start: '2026-11-03', end: '2026-11-03', notes: null }, agent: null, days: [] })).toContain('No viewings planned yet');
  });
});
