import { FeedService } from './feed.service';

// The override map and the province rewrite are pure logic on FeedService, so
// they're exercised directly against a bare instance rather than standing up
// the whole Nest module + 8 repositories.
const svc = Object.create(FeedService.prototype) as FeedService;
const normalize = (raw: any) => (svc as any).normalizeAreaProvinceOverrides(raw);
const slugify = (s: string) => (svc as any).slugify(s);

// Mirrors what findOrCreateLocation does with the map.
const resolveProvince = (
  overrides: Record<string, string>,
  location: { province?: string; area?: string },
) => {
  const area = (location.area || '').trim();
  const override = area ? overrides[slugify(area)] : undefined;
  return (override || location.province || '').trim();
};

describe('platform defaults', () => {
  // The whole point of shipping defaults: a brand-new Resales client is fixed
  // on day one, with no per-tenant configuration.
  it('apply to a tenant with no settings at all', () => {
    const map = normalize(undefined);
    expect(map['costa-del-sol']).toBe('Málaga');
    expect(map['costa-blanca']).toBe('Alicante');
    expect(map['costa-brava']).toBe('Girona');
  });

  // Costa de la Luz spans Huelva AND Cádiz — forcing either would misfile real
  // properties, so it must stay absent and keep whatever the feed sent.
  it('omit costas that span more than one province', () => {
    const map = normalize(undefined);
    expect(map['costa-de-la-luz']).toBeUndefined();
    expect(map['costa-vasca']).toBeUndefined();
  });

  it('every default maps to a non-empty province name', () => {
    const map = normalize(undefined);
    for (const [area, province] of Object.entries(map) as Array<[string, string]>) {
      expect(typeof province).toBe('string');
      expect(province.trim().length).toBeGreaterThan(0);
      expect(area).toBe(slugify(area)); // keys must already be slugs
    }
  });
});

describe('tenant overrides on top of defaults', () => {
  it('keys on the area slug so operator formatting does not matter', () => {
    const map = normalize({ 'Costa Del Sol': 'Sevilla', '  costa-brava  ': 'Barcelona' });
    expect(map[slugify('costa del sol')]).toBe('Sevilla');
    expect(map[slugify('COSTA BRAVA')]).toBe('Barcelona');
  });

  it('lets a tenant add an area the platform map does not cover', () => {
    const map = normalize({ 'costa-de-la-luz': 'Huelva' });
    expect(map['costa-de-la-luz']).toBe('Huelva');
    expect(map['costa-del-sol']).toBe('Málaga'); // defaults still intact
  });

  // The escape hatch for a client whose feed genuinely is the exception.
  it('an empty value opts the tenant out of a platform default', () => {
    const map = normalize({ 'costa-del-sol': '' });
    expect(map['costa-del-sol']).toBeUndefined();
    expect(map['costa-blanca']).toBe('Alicante');
  });

  it('ignores non-string values rather than corrupting the map', () => {
    const map = normalize({ 'costa-del-sol': 123, 'costa-blanca': null });
    expect(map['costa-del-sol']).toBe('Málaga');
    expect(map['costa-blanca']).toBe('Alicante');
  });

  it('tolerates a missing or malformed setting', () => {
    expect(normalize(null)['costa-del-sol']).toBe('Málaga');
    expect(normalize('nonsense')['costa-del-sol']).toBe('Málaga');
  });
});

describe('area → province override applied at import', () => {
  // No tenant settings — relying purely on the platform default.
  const overrides = normalize(undefined);

  // The reported bug: one property carrying Cádiz + Costa del Sol created a
  // second "Costa del Sol" node under Cádiz, duplicating the Málaga one.
  it('pins a mapped area to its canonical province', () => {
    expect(
      resolveProvince(overrides, { province: 'Cádiz', area: 'Costa del Sol' }),
    ).toBe('Málaga');
  });

  it('is a no-op when the feed already agrees', () => {
    expect(
      resolveProvince(overrides, { province: 'Málaga', area: 'Costa del Sol' }),
    ).toBe('Málaga');
  });

  // Costa de la Luz spans Huelva and Cádiz, so it is intentionally unmapped —
  // this property keeps the province its feed supplied.
  it('leaves unmapped areas exactly as the feed sent them', () => {
    expect(
      resolveProvince(overrides, { province: 'Cádiz', area: 'Costa de la Luz' }),
    ).toBe('Cádiz');
    expect(
      resolveProvince(overrides, { province: 'Huelva', area: 'Costa de la Luz' }),
    ).toBe('Huelva');
  });

  it('matches regardless of how the feed cases or spaces the area', () => {
    expect(
      resolveProvince(overrides, { province: 'Cádiz', area: '  COSTA DEL SOL ' }),
    ).toBe('Málaga');
  });

  it('supplies a province even when the feed omits one', () => {
    expect(resolveProvince(overrides, { area: 'Costa del Sol' })).toBe('Málaga');
  });

  // Not reachable via normalize() any more (defaults always apply), but the
  // resolver itself must still be a no-op on an empty map.
  it('changes nothing when handed an empty map', () => {
    expect(
      resolveProvince({}, { province: 'Cádiz', area: 'Costa del Sol' }),
    ).toBe('Cádiz');
  });

  it('does not invent a province for a property that has no area', () => {
    expect(resolveProvince(overrides, { province: 'Cádiz' })).toBe('Cádiz');
    expect(resolveProvince(overrides, {})).toBe('');
  });
});
