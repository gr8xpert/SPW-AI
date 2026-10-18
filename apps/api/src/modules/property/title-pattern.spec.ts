import { bedroomsText, cleanTitlePatterns, patternSetFor, pickTitlePattern, renderTitle, unknownTitleTokens } from './title-pattern';

describe('title patterns', () => {
  const set = {
    default: { en: '{type} for sale in {location}', es: '{type} en venta en {location}' },
    rent: { en: '{type} for rent in {location}' },
  };

  it('fills the fields', () => {
    expect(renderTitle('{type} for sale in {location}', { type: 'Apartment', location: 'Marbella' })).toBe('Apartment for sale in Marbella');
    expect(renderTitle('{bedrooms} bed {type}, {area}', { bedrooms: '3', type: 'Villa', area: 'Marbella' })).toBe('3 bed Villa, Marbella');
  });

  it('gives up when a field has no value or is unknown', () => {
    expect(renderTitle('{type} for sale in {location}', { type: 'Apartment', location: '' })).toBeNull();
    expect(renderTitle('{type} in {loction}', { type: 'Apartment' })).toBeNull();
  });

  it('prefers the visitor language over a listing-type pattern in English', () => {
    expect(pickTitlePattern(set, 'rent', 'es')).toBe('{type} en venta en {location}');
    expect(pickTitlePattern(set, 'rent', 'en')).toBe('{type} for rent in {location}');
    expect(pickTitlePattern(set, 'sale', 'de')).toBe('{type} for sale in {location}');
    expect(pickTitlePattern(set, 'offplan', 'es-ES')).toBe('{type} en venta en {location}');
    expect(pickTitlePattern({}, 'sale', 'en')).toBeNull();
  });

  it('cleans the saved setting', () => {
    const p = cleanTitlePatterns({
      enabled: true,
      card: { default: { EN: '  {type}   in {location} ', xx_bad: 'x', fr: '' }, bogus: { en: 'x' } },
      detailSameAsCard: false,
      detail: { sale: { en: '{type}' } },
    });
    expect(p.card).toEqual({ default: { en: '{type} in {location}' } });
    expect(patternSetFor(p, 'detail')).toEqual({ sale: { en: '{type}' } });
    expect(cleanTitlePatterns(null).enabled).toBe(false);
    expect(cleanTitlePatterns({ enabled: 'yes' }).enabled).toBe(false);
    expect(unknownTitleTokens(cleanTitlePatterns({ card: { default: { en: '{type} {loction}' } } }))).toEqual(['loction']);
  });

  it('shows bedroom ranges', () => {
    expect(bedroomsText(3, null)).toBe('3');
    expect(bedroomsText(2, 4)).toBe('2–4');
    expect(bedroomsText(0, 4)).toBeNull();
  });
});
