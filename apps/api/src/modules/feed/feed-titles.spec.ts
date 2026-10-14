import { buildListingTitles, TITLE_PATTERNS } from './feed-titles';

describe('buildListingTitles', () => {
  const type = { en: 'Detached Villa', nl: 'Vrijstaande villa', es: 'Villa independiente', fr: 'Villa individuelle', fi: 'Omakotitalo' };
  const town = { en: 'Mijas', es: 'Mijas' };

  it('says "in" the way each language does', () => {
    const t = buildListingTitles(type, town);
    expect(t.en).toBe('Detached Villa in Mijas');
    expect(t.nl).toBe('Vrijstaande villa in Mijas');
    expect(t.es).toBe('Villa independiente en Mijas');
    expect(t.fr).toBe('Villa individuelle à Mijas');
    expect(t.fi).toBe('Omakotitalo, Mijas');
  });

  it('leaves out languages the type has no name in', () => {
    expect(buildListingTitles(type, town).de).toBeUndefined();
  });

  it('uses the town name of the language when there is one', () => {
    const t = buildListingTitles({ en: 'Villa', ru: 'Вилла' }, { en: 'Marbella', ru: 'Марбелья' });
    expect(t.ru).toBe('Вилла в Марбелья');
  });

  it('gives the type alone without a town, nothing without a type', () => {
    expect(buildListingTitles({ en: 'Villa' }, null)).toEqual({ en: 'Villa' });
    expect(buildListingTitles(null, town)).toEqual({});
  });

  it('covers every language the platform translates into', () => {
    for (const lang of ['en', 'es', 'de', 'fr', 'nl', 'pt', 'it', 'ru', 'sv', 'no', 'da', 'pl', 'fi']) {
      expect(TITLE_PATTERNS[lang]).toContain('{town}');
    }
  });
});
