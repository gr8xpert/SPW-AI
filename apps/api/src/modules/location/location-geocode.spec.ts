import { LocationGeocodeService } from './location-geocode.service';

// Listings with no GPS of their own are drawn at their place's point, so one
// wrong row moves every listing in that place. Three of Cristihomes' 28 places
// were wrong — Montemar with its coordinates the wrong way round (Tanzania),
// Torremolinos 731 km out in Algeria, and a "Los Alamos" that is a village in
// Almería rather than the Torremolinos neighbourhood. Each of those is a case
// here: the answer is only kept when it lands near the place's parent.

const MALAGA = { id: 1, tenantId: 1, name: { en: 'Malaga' }, level: 'province', parentId: null, lat: 36.72, lng: -4.42 };
const TORREMOLINOS = { id: 2, tenantId: 1, name: { en: 'Torremolinos' }, level: 'municipality', parentId: 1, lat: 36.6229, lng: -4.4996 };

function service(
  rows: any[],
  answers: Record<string, { lat: number; lng: number; boundary?: any } | null>,
) {
  const saved: any[] = [];
  const repo = {
    find: jest.fn().mockResolvedValue(rows),
    save: jest.fn(async (row: any) => { saved.push({ ...row }); return row; }),
    // `boundary` is hidden on the entity, so the service asks separately which
    // places already have an outline.
    createQueryBuilder: jest.fn(() => {
      const qb: any = {
        select: () => qb,
        where: () => qb,
        andWhere: () => qb,
        getRawMany: async () => rows.filter((r) => r.boundary).map((r) => ({ id: r.id })),
      };
      return qb;
    }),
  };
  const svc = new LocationGeocodeService(repo as any);
  (svc as any).logger = { log: jest.fn(), warn: jest.fn() };
  // Answer instead of calling OpenStreetMap, and record what was asked.
  const asked: string[] = [];
  (svc as any).lookup = jest.fn(async (query: string) => {
    asked.push(query);
    return answers[query] ?? null;
  });
  const reasonFor = (out: any, name: string) => (out.rejected.find((r: any) => r.name === name) || {}).reason;
  return { svc, repo, saved, asked, reasonFor };
}

describe('putting a client’s places on the map', () => {
  it('asks for a place inside its parents, not on its own', async () => {
    const alamos = { id: 3, tenantId: 1, name: { en: 'Los Alamos' }, level: 'town', parentId: 2, lat: null, lng: null };
    const { svc, asked } = service([alamos, TORREMOLINOS, MALAGA], { 'Los Alamos, Torremolinos, Malaga': { lat: 36.6, lng: -4.52 } });
    await svc.run(1);
    expect(asked).toContain('Los Alamos, Torremolinos, Malaga');
  });

  it('refuses an answer that is nowhere near the parent', async () => {
    const alamos = { id: 3, tenantId: 1, name: { en: 'Los Alamos' }, level: 'town', parentId: 2, lat: null, lng: null };
    // The Almería village, 275 km away.
    const { svc, reasonFor } = service([alamos, TORREMOLINOS, MALAGA], { 'Los Alamos, Torremolinos, Malaga': { lat: 37.54157, lng: -2.3297 } });
    const out = await svc.run(1);
    expect(out.fixed.find((f: any) => f.name === 'Los Alamos')).toBeUndefined();
    expect(reasonFor(out, 'Los Alamos')).toMatch(/km from Torremolinos/);
  });

  it('corrects a place whose coordinates were the wrong way round', async () => {
    // Montemar as stored: lat -4.5, lng 36.6 — Tanzania.
    const montemar = { id: 4, tenantId: 1, name: { en: 'Montemar' }, level: 'town', parentId: 2, lat: -4.50824, lng: 36.60998 };
    const { svc, saved } = service([montemar, TORREMOLINOS, MALAGA], { 'Montemar, Torremolinos, Malaga': { lat: 36.60998, lng: -4.50824 } });
    const out = await svc.run(1);
    const written = saved.find((r: any) => r.id === montemar.id);
    expect(written.lat).toBeCloseTo(36.60998, 4);
    expect(written.lng).toBeCloseTo(-4.50824, 4);
    expect(out.fixed.find((f: any) => f.name === 'Montemar')?.from).toBe('-4.50824,36.60998');
  });

  it('leaves a place alone when the answer already matches', async () => {
    const carihuela = { id: 5, tenantId: 1, name: { en: 'La Carihuela' }, level: 'town', parentId: 2, lat: 36.61388, lng: -4.50117 };
    const { svc, saved } = service([carihuela, TORREMOLINOS, MALAGA], { 'La Carihuela, Torremolinos, Malaga': { lat: 36.61388, lng: -4.50117 } });
    const out = await svc.run(1);
    expect(saved.find((r: any) => r.id === carihuela.id)).toBeUndefined();
    expect(out.unchanged).toBeGreaterThanOrEqual(1);
  });

  it('stores an outline for a place whose point was already right', async () => {
    // The point needs no correction, but we had never fetched its shape — and
    // the map draws the town rather than guessing at a street.
    const carihuela = { id: 5, tenantId: 1, name: { en: 'La Carihuela' }, level: 'town', parentId: 2, lat: 36.61388, lng: -4.50117 };
    const outline = { type: 'Polygon', coordinates: [[[-4.51, 36.61], [-4.49, 36.61], [-4.49, 36.62], [-4.51, 36.62], [-4.51, 36.61]]] };
    const { svc, saved } = service([carihuela, TORREMOLINOS, MALAGA], {
      'La Carihuela, Torremolinos, Malaga': { lat: 36.61388, lng: -4.50117, boundary: outline },
    });
    await svc.run(1);
    expect(saved.find((r: any) => r.id === carihuela.id)?.boundary).toEqual(outline);
  });

  it('does not rewrite an outline it already has', async () => {
    const carihuela = { id: 5, tenantId: 1, name: { en: 'La Carihuela' }, level: 'town', parentId: 2, lat: 36.61388, lng: -4.50117, boundary: { type: 'Polygon', coordinates: [] } };
    const { svc, saved } = service([carihuela, TORREMOLINOS, MALAGA], {
      'La Carihuela, Torremolinos, Malaga': { lat: 36.61388, lng: -4.50117, boundary: { type: 'Polygon', coordinates: [] } },
    });
    await svc.run(1);
    expect(saved.find((r: any) => r.id === carihuela.id)).toBeUndefined();
  });

  it('keeps the old value when the place cannot be found at all', async () => {
    const odd = { id: 6, tenantId: 1, name: { en: 'Nowhere In Particular' }, level: 'town', parentId: 2, lat: 36.6, lng: -4.5 };
    const { svc, saved, reasonFor } = service([odd, TORREMOLINOS, MALAGA], {});
    const out = await svc.run(1);
    // Its own coordinates are plausible for Torremolinos, so they stay.
    expect(saved.find((r: any) => r.id === odd.id)).toBeUndefined();
    expect(reasonFor(out, 'Nowhere In Particular')).toMatch(/nothing found/);
  });

  it('accepts a province moving a long way, since its parent is a whole region', async () => {
    const province = { id: 7, tenantId: 1, name: { en: 'Malaga' }, level: 'province', parentId: 8, lat: null, lng: null };
    const andalucia = { id: 8, tenantId: 1, name: { en: 'Andalucia' }, level: 'region', parentId: null, lat: 37.5, lng: -4.5 };
    const { svc, saved } = service([province, andalucia], { 'Malaga, Andalucia': { lat: 36.72, lng: -4.42 } });
    await svc.run(1);
    const written = saved.find((r: any) => r.id === province.id);
    expect(written.lat).toBeCloseTo(36.72, 2);
  });

  it('corrects a parent before judging its children', async () => {
    // Torremolinos is in Algeria and Montemar hangs off it. Montemar's real
    // answer is 730 km from that, so checked in the wrong order it is thrown
    // out — which is exactly what happened on the live site.
    const badTorremolinos = { id: 2, tenantId: 1, name: { en: 'Torremolinos' }, level: 'municipality', parentId: 1, lat: 32.15488, lng: 0.30649 };
    const montemar = { id: 4, tenantId: 1, name: { en: 'Montemar' }, level: 'town', parentId: 2, lat: -4.50824, lng: 36.60998 };
    const { svc, saved } = service([montemar, badTorremolinos, MALAGA], {
      'Torremolinos, Malaga': { lat: 36.6229, lng: -4.4996 },
      'Montemar, Torremolinos, Malaga': { lat: 36.60998, lng: -4.50824 },
    });
    const out = await svc.run(1);
    expect(out.fixed.map((f) => f.name)).toEqual(['Torremolinos', 'Montemar']);
    expect(saved[saved.length - 1].lat).toBeCloseTo(36.60998, 4);
  });

  it('moves a place to its parent rather than leaving it on the wrong continent', async () => {
    // Nothing can be found for it, and what is stored is impossible.
    const montemar = { id: 4, tenantId: 1, name: { en: 'Montemar' }, level: 'town', parentId: 2, lat: -4.50824, lng: 36.60998 };
    const { svc, saved, repo } = service([montemar, TORREMOLINOS, MALAGA], {});
    const out = await svc.run(1);
    expect(repo.save).toHaveBeenCalled();
    expect(saved[0].lat).toBeCloseTo(36.6229, 3);
    expect(out.fixed[0].to).toMatch(/moved to Torremolinos/);
  });
});
