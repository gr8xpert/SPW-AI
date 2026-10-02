import { LOCATION_TEMPLATE_SEED } from './seed/location-template.seed';
import { locationKey, LOCATION_LEVELS } from './location-name';
import { FeedLocationInput, resolveLocation, TemplateIndex, TemplateNodeLite } from './location-template.resolver';

// Runs against the real seed (the Odoo exports) so the cases below are the
// places feeds actually send.
function seedIndex(extra: Array<Partial<TemplateNodeLite> & { parentPath?: string[] }> = []): TemplateIndex {
  const nodes: TemplateNodeLite[] = LOCATION_TEMPLATE_SEED.map(([parent, level, name, , lat, lng, note], i) => ({
    id: i + 1,
    parentId: parent >= 0 ? parent + 1 : null,
    level: LOCATION_LEVELS[level],
    name,
    nameKey: locationKey(name),
    aliases: null,
    status: note ? 'needs_review' : 'ok',
    lat,
    lng,
  }));
  for (const e of extra) Object.assign(nodes.find((n) => n.id === e.id)!, e);
  return new TemplateIndex(nodes);
}

const index = seedIndex();
const pathOf = (loc: FeedLocationInput) => {
  const r = resolveLocation(index, loc);
  if (!r) return null;
  return [...index.path(r.anchor).map((n) => `${n.level}:${n.name}`), ...r.extras.map((e) => `${e.level}:${e.name}+`)];
};
const resales = (town: string, sub?: string): FeedLocationInput => ({
  province: 'Málaga',
  area: 'Costa del Sol',
  town,
  urbanization: sub,
});

describe('resolveLocation (Resales: Province / Area / Location / SubLocation)', () => {
  it('puts a Resales "Location" under its municipality', () => {
    expect(pathOf(resales('Arroyo de la Miel'))).toEqual([
      'region:Andalucía', 'province:Málaga', 'area:Costa del Sol', 'municipality:Benalmádena', 'town:Arroyo de la Miel',
    ]);
  });

  it('ignores accents and case', () => {
    expect(pathOf(resales('HIGUERON'))?.slice(-2)).toEqual(['municipality:Benalmádena', 'town:Higuerón']);
    expect(pathOf({ province: 'Malaga', area: 'costa del sol', town: 'benalmadena costa' })?.slice(-2)).toEqual([
      'municipality:Benalmádena', 'town:Benalmadena Costa',
    ]);
  });

  it('a name that is both a municipality and its main town resolves to the town', () => {
    expect(pathOf(resales('Benalmadena'))?.slice(-2)).toEqual(['municipality:Benalmádena', 'town:Benalmádena']);
    expect(pathOf(resales('Fuengirola'))?.slice(-2)).toEqual(['municipality:Fuengirola', 'town:Fuengirola']);
  });

  it('places every location Resales sends for the Cristi Homes feed in the right municipality', () => {
    const expected: Record<string, string> = {
      'Arroyo de la Miel': 'Benalmádena', 'Benalmadena Costa': 'Benalmádena', 'Benalmadena Pueblo': 'Benalmádena',
      Higueron: 'Benalmádena', 'La Capellania': 'Benalmádena', Torremar: 'Benalmádena', Torremuelle: 'Benalmádena',
      Torrequebrada: 'Benalmádena', Carvajal: 'Fuengirola', 'El Coto': 'Fuengirola', 'Los Boliches': 'Fuengirola',
      'Los Pacos': 'Fuengirola', 'El Pinillo': 'Torremolinos', 'La Carihuela': 'Torremolinos', 'La Colina': 'Torremolinos',
      Montemar: 'Torremolinos', 'Las Lagunas': 'Mijas', Calahonda: 'Mijas', 'La Cala de Mijas': 'Mijas',
      'Riviera del Sol': 'Mijas', Sierrezuela: 'Mijas', 'Mijas Costa': 'Mijas',
    };
    for (const [town, municipality] of Object.entries(expected)) {
      const r = resolveLocation(index, resales(town))!;
      expect([town, index.ancestor(r.anchor, 'municipality')?.name, r.extras]).toEqual([town, municipality, []]);
    }
  });

  it('a SubLocation the template knows as a town wins over its Location', () => {
    expect(pathOf(resales('Fuengirola', 'Los Boliches'))?.slice(-2)).toEqual(['municipality:Fuengirola', 'town:Los Boliches']);
  });

  it('an unknown SubLocation is not created: the listing stays in its Location, and it is reported', () => {
    const r = resolveLocation(index, resales('Fuengirola', 'Mirador del Castillo'))!;
    expect(r.anchor.name).toBe('Fuengirola');
    expect(r.extras).toEqual([]);
    expect(r.unmatched).toEqual({ name: 'Mirador del Castillo', subName: null });
  });

  it('an unknown town is kept under the area and reported', () => {
    const r = resolveLocation(index, resales('Villa Nowhere', 'Sub Nowhere'))!;
    expect(index.path(r.anchor).map((n) => n.name)).toEqual(['Andalucía', 'Málaga', 'Costa del Sol']);
    expect(r.extras).toEqual([{ name: 'Villa Nowhere', level: 'town' }]);
    expect(r.unmatched).toEqual({ name: 'Villa Nowhere', subName: 'Sub Nowhere' });
  });
});

describe('resolveLocation (other feeds and edge cases)', () => {
  it('uses the province to tell same-named towns apart', () => {
    expect(pathOf({ province: 'Alicante', town: 'El Chaparral' })?.slice(-2)).toEqual(['municipality:Torrevieja', 'town:El Chaparral']);
    expect(pathOf({ province: 'Málaga', town: 'El Chaparral' })?.slice(-2)).toEqual(['municipality:Mijas', 'town:El Chaparral']);
  });

  it('refuses to guess an ambiguous town without a province', () => {
    expect(resolveLocation(index, { town: 'El Chaparral' })).toBeNull();
  });

  it('Kyero-style municipality + unknown town anchors at the municipality', () => {
    const r = resolveLocation(index, { province: 'Malaga', municipality: 'Mijas', town: 'Brand New Place' })!;
    expect(r.anchor.level).toBe('municipality');
    expect(r.anchor.name).toBe('Mijas');
    expect(r.extras).toEqual([{ name: 'Brand New Place', level: 'town' }]);
  });

  it('never puts an urbanization anywhere but inside a town (ADSUBIA under Alicante is a town)', () => {
    const r = resolveLocation(index, { province: 'Alicante', urbanization: 'ADSUBIA' })!;
    expect(r.anchor.level).toBe('province');
    expect(r.extras).toEqual([{ name: 'ADSUBIA', level: 'town' }]);
  });

  it('an unknown urbanization inside a known town is not created (Centro under Málaga Centro)', () => {
    const r = resolveLocation(index, { province: 'Málaga', area: 'Costa del Sol', town: 'Arroyo de la Miel', urbanization: 'Brand New Urb' })!;
    expect(r.anchor.name).toBe('Arroyo de la Miel');
    expect(r.extras).toEqual([]);
    expect(r.unmatched).toEqual({ name: 'Brand New Urb', subName: null });
  });

  it('matches aliases', () => {
    const higueron = [...index.byId.values()].find((n) => n.nameKey === 'higueron' && n.level === 'town')!;
    const withAlias = seedIndex([{ id: higueron.id, aliases: ['El Higuerón Resort'] }]);
    const r = resolveLocation(withAlias, resales('el higueron resort'))!;
    expect(r.anchor.id).toBe(higueron.id);
    expect(r.extras).toEqual([]);
  });

  it('returns null when neither the province nor any name is known', () => {
    expect(resolveLocation(index, { province: 'Atlantis', town: 'Nowhere' })).toBeNull();
  });
});

describe('map coordinates from the template', () => {
  const find = (name: string, level: string, parent: string) =>
    [...index.byId.values()].find(
      (n) => n.nameKey === locationKey(name) && n.level === level && index.byId.get(n.parentId!)?.nameKey === locationKey(parent),
    )!;

  it('a town uses its own point', () => {
    const arroyo = find('Arroyo de la Miel', 'town', 'Benalmádena');
    const c = index.coords(arroyo)!;
    expect(c.lat).toBeCloseTo(36.6, 1);
    expect(c.lng).toBeCloseTo(-4.53, 1);
  });

  it('a municipality without a point uses the centre of its towns', () => {
    const benalmadena = find('Benalmádena', 'municipality', 'Costa del Sol');
    const c = index.coords(benalmadena)!;
    expect(c.lat).toBeGreaterThan(36.55);
    expect(c.lat).toBeLessThan(36.65);
    expect(c.lng).toBeGreaterThan(-4.62);
    expect(c.lng).toBeLessThan(-4.48);
  });

  it('regions, provinces and areas get no point, and a town with none does not inherit one', () => {
    const cds = [...index.byId.values()].find((n) => n.level === 'area' && n.nameKey === 'costa del sol')!;
    const malaga = index.byId.get(cds.parentId!)!;
    expect(index.coords(cds)).toBeNull();
    expect(index.coords(malaga)).toBeNull();
    const orphanTown = { id: -2, parentId: cds.id, level: 'town' as const, name: 'X', nameKey: 'x', aliases: null, status: 'ok' as const, lat: null, lng: null };
    expect(index.coords(orphanTown)).toBeNull();
  });
});
