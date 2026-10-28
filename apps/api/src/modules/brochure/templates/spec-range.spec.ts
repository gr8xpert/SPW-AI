import { renderLayoutV1Sections, specRange } from './layout-v1';

describe('brochure specRange', () => {
  it('prints a development range like the website', () => {
    expect(specRange(1, 3)).toBe('1–3');
    expect(specRange(80.4, 140.6, 'm²')).toBe('80–141m²');
  });

  it('prints a single value when there is no higher end', () => {
    expect(specRange(2, null)).toBe('2');
    expect(specRange(2, 2)).toBe('2');
    expect(specRange(95, 0, 'm²')).toBe('95m²');
  });

  it('leaves out empty and zero values', () => {
    expect(specRange(null, 3)).toBeNull();
    expect(specRange(0, null, 'm²')).toBeNull();
  });
});

describe('brochure page specs', () => {
  it('shows a development listing with ranges', () => {
    const html = renderLayoutV1Sections({
      property: {
        reference: 'R5511217', title: 'New development', description: '', price: 395000, priceTo: 650000, rentalPeriod: null,
        listingType: 'development', currency: 'EUR', priceOnRequest: false,
        bedrooms: 2, bathrooms: 2, buildSize: 86, plotSize: null, terraceSize: 20,
        bedroomsTo: 3, bathroomsTo: 3, buildSizeTo: 128, plotSizeTo: null, terraceSizeTo: 45,
        energyRating: null, listingTypeLabel: 'New development', propertyTypeName: 'Apartment', locationName: 'Estepona',
        locationFullPath: null, images: [], features: [],
      },
      tenant: { name: 'Agency', logoUrl: null, contactEmail: null, contactPhone: null, primaryColor: '#000000', websiteUrl: null },
      labels: {}, variant: 'unbranded', qrDataUrl: null, publicUrl: null, lang: 'en',
    });
    expect(html).toContain('2–3');
    expect(html).toContain('86–128m²');
    expect(html).toContain('20–45m²');
  });
});
