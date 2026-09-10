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

describe('normalizeAreaProvinceOverrides', () => {
  it('keys on the area slug so operator formatting does not matter', () => {
    const map = normalize({
      'Costa Del Sol': 'Málaga',
      '  costa-blanca  ': 'Alicante',
    });
    expect(map[slugify('costa del sol')]).toBe('Málaga');
    expect(map[slugify('COSTA BLANCA')]).toBe('Alicante');
  });

  it('drops entries that would blank out a province', () => {
    const map = normalize({
      'costa-del-sol': '',
      'costa-blanca': '   ',
      'costa-calida': null,
      'costa-tropical': 123,
    });
    expect(map).toEqual({});
  });

  it('tolerates a missing or malformed setting', () => {
    expect(normalize(undefined)).toEqual({});
    expect(normalize(null)).toEqual({});
    expect(normalize('nonsense')).toEqual({});
  });
});

describe('area → province override applied at import', () => {
  const overrides = normalize({ 'costa-del-sol': 'Málaga' });

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

  it('leaves unmapped areas exactly as the feed sent them', () => {
    expect(
      resolveProvince(overrides, { province: 'Cádiz', area: 'Costa de la Luz' }),
    ).toBe('Cádiz');
  });

  it('matches regardless of how the feed cases or spaces the area', () => {
    expect(
      resolveProvince(overrides, { province: 'Cádiz', area: '  COSTA DEL SOL ' }),
    ).toBe('Málaga');
  });

  it('supplies a province even when the feed omits one', () => {
    expect(resolveProvince(overrides, { area: 'Costa del Sol' })).toBe('Málaga');
  });

  it('changes nothing when no overrides are configured', () => {
    expect(
      resolveProvince({}, { province: 'Cádiz', area: 'Costa del Sol' }),
    ).toBe('Cádiz');
  });

  it('does not invent a province for a property that has no area', () => {
    expect(resolveProvince(overrides, { province: 'Cádiz' })).toBe('Cádiz');
    expect(resolveProvince(overrides, {})).toBe('');
  });
});
