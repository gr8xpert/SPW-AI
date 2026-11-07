import type { Property } from '../../database/entities';
import type { KyeroLocationRow } from './kyero/kyero-builder';
import type { ExportLookups } from './export-rows';
import { makeFeedWriter } from './portal-writers';
import { thinkSpainType } from './portals/thinkspain-builder';
import { communityOf } from './portals/portal-common';

const lookups: ExportLookups = {
  locations: new Map<number, KyeroLocationRow>([
    [10, { id: 10, parentId: null, level: 'province', name: { en: 'Málaga' } }],
    [11, { id: 11, parentId: 10, level: 'town', name: { en: 'Nueva Andalucía' } }],
    [12, { id: 12, parentId: 11, level: 'urbanization', name: { en: 'El Palmeral' } }],
  ]),
  types: new Map([
    [1, { name: { en: 'House' }, parentId: null }],
    [2, { name: { en: 'Townhouse' }, parentId: 1 }],
  ]),
  features: new Map([
    [1, { name: { en: 'Private Pool', es: 'Piscina privada' } }],
    [2, { name: { en: 'Garage', es: 'Garaje' } }],
  ]),
};

const listing = (p: Partial<Property> = {}): Property =>
  ({
    id: 7,
    reference: 'R5506450',
    agentReference: 'SHM019',
    listingType: 'sale',
    price: 980000,
    currency: 'EUR',
    propertyTypeId: 2,
    locationId: 12,
    bedrooms: 3,
    bathrooms: 3,
    buildSize: 205,
    plotSize: 25,
    terraceSize: 42,
    postcode: '29660',
    street: 'Calle Sol',
    streetNumber: '4',
    features: [1, 2, 1],
    images: [
      { url: 'https://cdn.example.com/2.jpg', order: 2 },
      { url: 'https://cdn.example.com/1.jpg', order: 1 },
    ],
    title: { en: 'Corner townhouse', es: 'Adosado en esquina' },
    description: { en: 'Corner townhouse.\n\nSecond paragraph.', es: 'Adosado.', de: 'Reihenhaus.' },
    energyRating: 'e',
    energyConsumption: 120,
    builtYear: 1997,
    videoUrl: 'https://youtu.be/x',
    virtualTourUrl: null,
    updatedAt: new Date('2026-10-20T18:40:44Z'),
    lat: 36.5,
    lng: -4.96,
    ...p,
  }) as Property;

const build = (format: Parameters<typeof makeFeedWriter>[0], props: Property[], languages: string[] = []) => {
  const w = makeFeedWriter(format, lookups, {
    languages,
    agentName: 'Sparkling Homes',
    urlFor: (p) => `https://site.com/en/property/${p.reference}`,
  });
  w.add(props);
  return w.finish();
};

describe('export feed writers', () => {
  it('Kyero keeps the chosen languages in order and adds the page link', () => {
    const { xml, included } = build('kyero', [listing()], ['de', 'en']);
    expect(included).toBe(1);
    expect(xml).toContain('<desc>\n      <de>Reihenhaus.</de>\n      <en>Corner townhouse.\n\nSecond paragraph.</en>\n    </desc>');
    expect(xml).not.toContain('<es>Adosado.</es>');
    expect(xml).toContain('<url>\n      <en>https://site.com/en/property/R5506450</en>\n    </url>');
    expect(xml).toContain('<type>Townhouse</type>');
    expect(xml).not.toContain('<completion_year>');
  });

  it('Fotocasa adds parent type, location block, energy and completion year', () => {
    const { xml } = build('fotocasa', [listing()]);
    expect(xml).toContain('<feed_version>3</feed_version>');
    expect(xml).toContain('<type>House - Townhouse</type>');
    expect(xml).toContain('<video_url>https://youtu.be/x</video_url>');
    expect(xml).toContain('<virtual_tour_url></virtual_tour_url>');
    expect(xml).toContain('<postalcode>29660</postalcode>');
    expect(xml).toContain('<address1>Calle Sol 4</address1>');
    expect(xml).toContain('<address2>Nueva Andalucía</address2>');
    expect(xml).toContain('<terrace>42</terrace>');
    expect(xml).toContain('<level>E</level>');
    expect(xml).toContain('<value>120</value>');
    expect(xml).toContain('<completion_year>1997</completion_year>');
  });

  it('ThinkSpain writes the 1.15 layout', () => {
    const { xml, included } = build('thinkspain', [listing()]);
    expect(included).toBe(1);
    expect(xml).toContain('<import_version>1.15</import_version>');
    expect(xml).toContain('<agent>\n    <name>Sparkling Homes</name>\n  </agent>');
    expect(xml).toContain('<unique_id>R5506450</unique_id>');
    expect(xml).toContain('<agent_ref>SHM019</agent_ref>');
    expect(xml).toContain('<euro_price>980000</euro_price>');
    expect(xml).toContain('<sale_type>sale</sale_type>');
    expect(xml).toContain('<property_type>Townhouse</property_type>');
    expect(xml).toContain('<living_area>205</living_area>');
    expect(xml).toContain('<plot_size>25</plot_size>');
    expect(xml).toContain('<description>\n      <en>Corner townhouse.\n\nSecond paragraph.</en>\n    </description>');
    expect(xml).toContain('<photo id="1">\n        <url>https://cdn.example.com/1.jpg</url>');
    expect(xml.match(/<feature>Private Pool<\/feature>/g)).toHaveLength(1);
  });

  it('ThinkSpain: monthly rent is "rent", weekly rent is left out', () => {
    const { xml, included, skipped } = build('thinkspain', [
      listing({ id: 1, reference: 'L1', listingType: 'long_term_rent' as any, rentalPeriod: 'month' as any, price: 1500 }),
      listing({ id: 2, reference: 'H1', listingType: 'holiday_rent' as any, rentalPeriod: 'week' as any, price: 900 }),
    ]);
    expect(included).toBe(1);
    expect(xml).toContain('<sale_type>rent</sale_type>');
    expect(skipped.map((s) => s.reference)).toEqual(['H1']);
  });

  it('A Place in the Sun writes its own layout, sales only', () => {
    const { xml, included, skipped } = build('apits', [
      listing(),
      listing({ id: 8, reference: 'RENT1', listingType: 'long_term_rent' as any, rentalPeriod: 'month' as any }),
    ]);
    expect(included).toBe(1);
    expect(skipped[0].reference).toBe('RENT1');
    expect(xml.startsWith("<?xml version='1.0' encoding='UTF-8'?>\n<Properties>")).toBe(true);
    expect(xml).toContain('<UniquePropertyID>R5506450</UniquePropertyID>');
    expect(xml).toContain('<PropertyName>\n      <en>Corner townhouse</en>\n    </PropertyName>');
    expect(xml).toContain('<Introduction>\n      <en>Corner townhouse.</en>\n    </Introduction>');
    expect(xml).toContain('<SalePrice>980000</SalePrice>');
    expect(xml).toContain('<Region>Andalucia</Region>');
    expect(xml).toContain('<Subregion>Málaga</Subregion>');
    expect(xml).toContain('<location_detail>El Palmeral</location_detail>');
    expect(xml).toContain('<Pool>1</Pool>');
    expect(xml).toContain('<feature>\n        <en>Garage</en>\n      </feature>');
    expect(xml).toContain('<Photo>\n        <Url>https://cdn.example.com/1.jpg</Url>\n        <Caption></Caption>\n      </Photo>');
    expect(xml).toContain('<Address></Address>');
  });

  it('maps type names and provinces', () => {
    expect(thinkSpainType('Middle Floor Apartment')).toBe('Apartment');
    expect(thinkSpainType('Detached Villa')).toBe('Villa');
    expect(thinkSpainType('Semi-Detached House')).toBe('Semi-detached Villa');
    expect(thinkSpainType('Penthouse Duplex')).toBe('Penthouse');
    expect(communityOf('Málaga')).toBe('Andalucia');
    expect(communityOf('Alicante')).toBe('Valencia');
    expect(communityOf('Atlantis')).toBe('');
  });
});
