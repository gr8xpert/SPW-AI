import { checkCoords, findOutliers, normalizePostcode, CoordNode } from './template-coords';

describe('template coordinates', () => {
  it('accepts a point in Spain', () => {
    expect(checkCoords('36.62428', '-4.49954')).toEqual({ ok: true, lat: 36.62428, lng: -4.49954 });
    // Canaries and Balearics are Spain too.
    expect(checkCoords(28.1, -15.4).ok).toBe(true);
    expect(checkCoords(39.76, 3.15).ok).toBe(true);
  });

  it('treats blank and 0,0 as missing, not as a problem', () => {
    expect(checkCoords('0.0', '0.0')).toEqual({ ok: false, problem: null });
    expect(checkCoords('', '')).toEqual({ ok: false, problem: null });
    expect(checkCoords(null, null)).toEqual({ ok: false, problem: null });
  });

  it('refuses swapped latitude and longitude (Montemar, Torremolinos)', () => {
    const c = checkCoords('-4.508240000000001', '36.60998000000001');
    expect(c.ok).toBe(false);
    expect(!c.ok && c.problem).toMatch(/swapped/);
  });

  it('refuses a point outside Spain', () => {
    const c = checkCoords(48.85, 2.35);
    expect(!c.ok && c.problem).toMatch(/outside Spain/);
  });

  it('puts back the leading zero spreadsheets drop', () => {
    expect(normalizePostcode('7316')).toBe('07316');
    expect(normalizePostcode('3812')).toBe('03812');
    expect(normalizePostcode('29620')).toBe('29620');
    expect(normalizePostcode('3812.0')).toBe('03812');
    expect(normalizePostcode('')).toBeNull();
  });

  it('flags a town far from the rest of its municipality', () => {
    const nodes: CoordNode[] = [
      { id: 1, parentId: null, level: 'municipality', name: 'Torremolinos', lat: null, lng: null },
      { id: 2, parentId: 1, level: 'town', name: 'Torremolinos Centro', lat: 36.62287, lng: -4.50104 },
      { id: 3, parentId: 1, level: 'town', name: 'El Pinillo', lat: 36.6098, lng: -4.5153 },
      { id: 4, parentId: 1, level: 'town', name: 'La Colina', lat: 36.64022, lng: -4.49261 },
      { id: 5, parentId: 1, level: 'town', name: 'Bajondillo', lat: 36.62299, lng: -4.49618 },
      { id: 6, parentId: 1, level: 'town', name: 'Los Alamos', lat: 37.54157, lng: -2.3297 },
      { id: 10, parentId: null, level: 'municipality', name: 'Benalmádena', lat: null, lng: null },
      { id: 11, parentId: 10, level: 'town', name: 'Benalmádena', lat: 36.59452, lng: -4.57228 },
      { id: 12, parentId: 10, level: 'town', name: 'Arroyo de la Miel', lat: 36.59908, lng: -4.53503 },
      { id: 13, parentId: 10, level: 'town', name: 'Torrequebrada', lat: 36.58184, lng: -4.53882 },
      { id: 14, parentId: 10, level: 'town', name: 'Benalmadena Costa', lat: 36.59312, lng: -4.52538 },
      { id: 15, parentId: 10, level: 'town', name: 'Torremuelle', lat: 36.58228, lng: -4.56709 },
      { id: 16, parentId: 10, level: 'town', name: 'Torremar', lat: 36.73832, lng: -4.47608 },
    ];
    const ids = findOutliers(nodes).map((o) => o.id).sort((a, b) => a - b);
    expect(ids).toEqual([6, 16]);
  });

  it('does not judge a municipality with fewer than three placed towns', () => {
    const nodes: CoordNode[] = [
      { id: 1, parentId: null, level: 'municipality', name: 'M', lat: null, lng: null },
      { id: 2, parentId: 1, level: 'town', name: 'A', lat: 36.6, lng: -4.5 },
      { id: 3, parentId: 1, level: 'town', name: 'B', lat: 37.5, lng: -2.3 },
    ];
    expect(findOutliers(nodes)).toEqual([]);
  });
});
