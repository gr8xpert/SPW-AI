import { fenceFor, resolveLocationPoints } from './location-points';

// The real rows from a client's site, which put seven Costa del Sol listings
// in Tanzania and eight more in Almería. The map must draw none of them in the
// wrong place, whatever the table says and whether or not anyone has run the
// location fixer.
const ANDALUCIA = { id: 1337, parentId: null, level: 'region', lat: 37.34, lng: -4.58116 } as any;
const MALAGA = { id: 1312, parentId: 1337, level: 'province', lat: 36.72, lng: -4.42 } as any;
const TORREMOLINOS = { id: 1319, parentId: 1312, level: 'municipality', lat: 36.6229, lng: -4.4996 } as any;

describe('where a place may be drawn', () => {
  it('keeps a place that sits where it should', () => {
    const carihuela = { id: 1, parentId: 1319, level: 'town', lat: 36.61388, lng: -4.50117 } as any;
    const points = resolveLocationPoints([ANDALUCIA, MALAGA, TORREMOLINOS, carihuela]);
    expect(points.get(1)).toEqual({ lat: 36.61388, lng: -4.50117, borrowed: false });
  });

  it('keeps a town that is simply a long way across its province', () => {
    // What "Malaga" is stored as is the city, not the middle of the province,
    // so Marbella sits 48 km from it — and is still plainly in Malaga. Judging
    // that by a town's own size rejected it and lost the town its outline.
    const marbella = { id: 1500, parentId: 1312, level: 'town', lat: 36.5099, lng: -4.8863 } as any;
    const points = resolveLocationPoints([ANDALUCIA, MALAGA, marbella]);
    expect(points.get(1500)).toEqual({ lat: 36.5099, lng: -4.8863, borrowed: false });
  });

  it('will not draw a place whose coordinates are the wrong way round', () => {
    // Montemar as stored: lat -4.5, lng 36.6 — Tanzania.
    const montemar = { id: 1327, parentId: 1319, level: 'town', lat: -4.50824, lng: 36.60998 } as any;
    const points = resolveLocationPoints([ANDALUCIA, MALAGA, TORREMOLINOS, montemar]);
    const drawn = points.get(1327)!;
    expect(drawn.borrowed).toBe(true);
    expect(drawn.lat).toBeCloseTo(36.6229, 3);
    expect(drawn.lng).toBeCloseTo(-4.4996, 3);
  });

  it('will not draw a namesake 275 km away', () => {
    // "Los Alamos" as stored: the village in Almería.
    const alamos = { id: 1400, parentId: 1319, level: 'town', lat: 37.54157, lng: -2.3297 } as any;
    const points = resolveLocationPoints([ANDALUCIA, MALAGA, TORREMOLINOS, alamos]);
    expect(points.get(1400)!.borrowed).toBe(true);
    expect(points.get(1400)!.lat).toBeCloseTo(36.6229, 3);
  });

  it('replaces a bad parent before judging its children against it', () => {
    // Torremolinos in Algeria, with Montemar beneath it. Montemar's own point
    // is right; it must not be thrown out for disagreeing with a bad parent.
    const badTorremolinos = { id: 1319, parentId: 1312, level: 'municipality', lat: 32.15488, lng: 0.30649 } as any;
    const montemar = { id: 1327, parentId: 1319, level: 'town', lat: 36.60998, lng: -4.50824 } as any;
    const points = resolveLocationPoints([ANDALUCIA, MALAGA, badTorremolinos, montemar]);
    // The parent falls back to Malaga...
    expect(points.get(1319)!.borrowed).toBe(true);
    expect(points.get(1319)!.lat).toBeCloseTo(36.72, 2);
    // ...and the child keeps its own, correct, point. It is now being judged
    // against a province-sized point, so a province's allowance applies.
    expect(points.get(1327)).toEqual({ lat: 36.60998, lng: -4.50824, borrowed: false });
  });

  it('judges a child by the size of the point it is measured against', () => {
    // An urbanization under a town that itself fell back to the province: the
    // point it is being compared with is really the province's, so the
    // urbanization's 20 km from the town it belongs to must not be rejected.
    const lostTown = { id: 1600, parentId: 1312, level: 'town', lat: -4.9, lng: 36.5 } as any;
    const urb = { id: 1601, parentId: 1600, level: 'urbanization', lat: 36.5099, lng: -4.8863 } as any;
    const points = resolveLocationPoints([ANDALUCIA, MALAGA, lostTown, urb]);
    expect(points.get(1600)!.borrowed).toBe(true);
    expect(points.get(1601)).toEqual({ lat: 36.5099, lng: -4.8863, borrowed: false });
  });

  it('gives no point at all when nothing in the ancestry is usable', () => {
    const orphan = { id: 2000, parentId: null, level: 'town', lat: -4.5, lng: 36.6 } as any;
    const points = resolveLocationPoints([orphan]);
    // With no parent to check against, its own value is all there is.
    expect(points.get(2000)).toEqual({ lat: -4.5, lng: 36.6, borrowed: false });

    const child = { id: 2001, parentId: 9999, level: 'town', lat: null, lng: null } as any;
    expect(resolveLocationPoints([child]).get(2001)).toBeUndefined();
  });

  it('lets a province sit a long way from its region', () => {
    const province = { id: 3000, parentId: 1337, level: 'province', lat: 36.72, lng: -4.42 } as any;
    const points = resolveLocationPoints([ANDALUCIA, province]);
    expect(points.get(3000)!.borrowed).toBe(false);
  });
});

describe('where a place\u2019s listings may be drawn', () => {
  const square = (x: number, y: number, size: number) => ({
    type: 'Polygon' as const,
    coordinates: [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]],
  });
  const huge = {
    type: 'Polygon' as const,
    // A region: too big to fence anything useful with.
    coordinates: [Array.from({ length: 1400 }, (_, i) => [-4 + i / 1000, 37])],
  };

  it('uses the place\u2019s own outline when it has one', () => {
    const town = { id: 1, parentId: 2, level: 'town', boundary: square(-4.5, 36.6, 0.05) } as any;
    const municipality = { id: 2, parentId: null, level: 'municipality', boundary: square(-4.6, 36.5, 0.2) } as any;
    const fence = fenceFor(town, new Map([[1, town], [2, municipality]]));
    expect(fence).toBe(town.boundary);
  });

  it('falls back to the municipality, which is what keeps a listing out of the sea', () => {
    // Torremuelle is a point in OpenStreetMap, not an area. Benalmadena is an
    // administrative boundary that follows the coastline.
    const torremuelle = { id: 1, parentId: 2, level: 'town', boundary: null } as any;
    const benalmadena = { id: 2, parentId: 3, level: 'municipality', boundary: square(-4.6, 36.5, 0.2) } as any;
    const province = { id: 3, parentId: null, level: 'province', boundary: square(-5, 36, 1) } as any;
    const fence = fenceFor(torremuelle, new Map([[1, torremuelle], [2, benalmadena], [3, province]]));
    expect(fence).toBe(benalmadena.boundary);
  });

  it('skips an outline too big to be worth fencing with', () => {
    const town = { id: 1, parentId: 2, level: 'town', boundary: null } as any;
    const region = { id: 2, parentId: null, level: 'region', boundary: huge } as any;
    expect(fenceFor(town, new Map([[1, town], [2, region]]))).toBeNull();
  });

  it('has nothing to offer when no ancestor has an outline', () => {
    const town = { id: 1, parentId: null, level: 'town', boundary: null } as any;
    expect(fenceFor(town, new Map([[1, town]]))).toBeNull();
  });
});
