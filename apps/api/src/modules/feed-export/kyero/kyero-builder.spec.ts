import type { Property } from '../../../database/entities';
import { KyeroInput, KyeroLocationRow, buildKyeroFeed, esc } from './kyero-builder';

const locations = new Map<number, KyeroLocationRow>([
  [10, { id: 10, parentId: null, level: 'province', name: { en: 'Málaga' } }],
  [11, { id: 11, parentId: 10, level: 'town', name: { en: 'Fuengirola' } }],
  [12, { id: 12, parentId: 11, level: 'urbanization', name: { en: 'Los Pacos' } }],
  [13, { id: 13, parentId: null, level: 'town', name: { en: 'Nowhere' } }],
]);

const input = (properties: Partial<Property>[]): KyeroInput => ({
  properties: properties.map((p, i) => ({
    id: i + 1,
    reference: `R${i + 1}`,
    listingType: 'sale',
    price: 345000,
    currency: 'EUR',
    propertyTypeId: 1,
    locationId: 12,
    bedrooms: 2,
    bathrooms: 2,
    buildSize: 80,
    plotSize: null,
    features: [1, 2],
    images: [
      { url: 'https://cdn.example.com/2.jpg', order: 2 },
      { url: 'https://cdn.example.com/1.jpg', order: 1 },
      { url: '/uploads/local.jpg', order: 3 },
    ],
    description: { en: '<p>Sea views &amp; sun</p>', es: 'Vistas al mar', xx: 'nope' },
    updatedAt: new Date('2026-09-05T17:13:58Z'),
    lat: null,
    lng: null,
    ...p,
  })) as Property[],
  types: new Map([[1, { name: { en: 'Middle Floor Apartment' } }]]),
  locations,
  features: new Map<number, { name: Record<string, string> }>([
    [1, { name: { en: 'Communal Pool' } }],
    [2, { name: { en: 'Lift', es: 'Ascensor' } }],
  ]),
});

describe('buildKyeroFeed', () => {
  it('writes a Kyero v3 property', () => {
    const { xml, included, skipped } = buildKyeroFeed(input([{}]));
    expect(included).toBe(1);
    expect(skipped).toEqual([]);
    expect(xml).toContain('<kyero>\n    <feed_version>3</feed_version>\n  </kyero>');
    expect(xml).toContain('<date>2026-09-05 17:13:58</date>');
    expect(xml).toContain('<price_freq>sale</price_freq>');
    expect(xml).toContain('<new_build>0</new_build>');
    expect(xml).toContain('<pool>1</pool>');
    expect(xml).toContain('<town>Fuengirola</town>');
    expect(xml).toContain('<province>Málaga</province>');
    expect(xml).toContain('<location_detail>Los Pacos</location_detail>');
    expect(xml).toContain('<surface_area>\n      <built>80</built>\n    </surface_area>');
    expect(xml).toContain('<desc>\n      <en>Sea views &amp; sun</en>\n      <es>Vistas al mar</es>\n    </desc>');
    expect(xml).not.toContain('<xx>');
    expect(xml).toContain('<feature>Lift</feature>');
    // Sorted by order; relative URLs dropped.
    expect(xml).toMatch(/<image id="1">\s*<url>https:\/\/cdn\.example\.com\/1\.jpg<\/url>/);
    expect(xml).not.toContain('/uploads/local.jpg');
  });

  it('maps rentals to week / month and skips nightly prices', () => {
    const { xml, skipped } = buildKyeroFeed(
      input([
        { listingType: 'rent', rentalPeriod: null },
        { listingType: 'holiday_rent', rentalPeriod: null },
        { listingType: 'holiday_rent', rentalPeriod: 'night' },
      ]),
    );
    expect(xml).toContain('<price_freq>month</price_freq>');
    expect(xml).toContain('<price_freq>week</price_freq>');
    expect(skipped.map((s) => s.reference)).toEqual(['R3']);
  });

  it('marks developments as new build', () => {
    expect(buildKyeroFeed(input([{ listingType: 'development' }])).xml).toContain('<new_build>1</new_build>');
  });

  it('skips listings Kyero would reject', () => {
    const { skipped } = buildKyeroFeed(
      input([{ price: null }, { propertyTypeId: null }, { locationId: 13 }, { locationId: 13, feedLocation: { province: 'Málaga' } }]),
    );
    expect(skipped).toEqual([
      { reference: 'R1', reason: 'No price' },
      { reference: 'R2', reason: 'No property type' },
      { reference: 'R3', reason: 'No province' },
    ]);
  });

  it('writes coordinates inside <location>', () => {
    const { xml } = buildKyeroFeed(input([{ lat: 36.54, lng: -4.62 }]));
    expect(xml).toContain('<location>\n      <latitude>36.54</latitude>\n      <longitude>-4.62</longitude>\n    </location>');
  });

  it('escapes markup and drops characters XML forbids', () => {
    expect(esc('a & <b> "c"\u0001')).toBe('a &amp; &lt;b&gt; &quot;c&quot;');
  });
});
