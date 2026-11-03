import { propertyWebsiteLink } from './property-website-link';

const listing = {
  reference: 'R123',
  title: { en: 'Sea View Villa', es: 'Villa con vistas' },
  slug: null,
  location: null,
  propertyType: null,
  websiteUrl: null as string | null,
};
const ctx = { lang: 'en', patterns: {} as Record<string, string>, slugFormat: 'title-ref', detailPageUrl: null as string | null };

describe('propertyWebsiteLink', () => {
  it('has no link when nothing is known', () => {
    expect(propertyWebsiteLink(listing, ctx)).toBeNull();
  });

  it('uses the folder the plugin reported', () => {
    expect(propertyWebsiteLink(listing, { ...ctx, detailPageUrl: 'https://site.com/en/property/' })).toBe(
      'https://site.com/en/property/sea-view-villa_R123',
    );
  });

  it('builds the segment in the client default language', () => {
    expect(propertyWebsiteLink(listing, { ...ctx, lang: 'es', detailPageUrl: 'https://site.com/propiedad' })).toBe(
      'https://site.com/propiedad/villa-con-vistas_R123',
    );
  });

  it('prefers the URL pattern over the plugin', () => {
    expect(
      propertyWebsiteLink(listing, {
        ...ctx,
        patterns: { default: 'https://a.com/p/{ref}' },
        detailPageUrl: 'https://b.com/property/',
      }),
    ).toBe('https://a.com/p/R123');
  });

  it('prefers the address typed on the listing', () => {
    expect(
      propertyWebsiteLink(
        { ...listing, websiteUrl: ' https://own.com/villa ' },
        { ...ctx, patterns: { default: 'https://a.com/p/{ref}' } },
      ),
    ).toBe('https://own.com/villa');
  });

  it('never returns a non-http address typed on the listing', () => {
    expect(propertyWebsiteLink({ ...listing, websiteUrl: 'javascript:alert(1)' }, ctx)).toBeNull();
  });
});
