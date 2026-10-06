import type { IdealistaExportSettings, Property } from '../../../database/entities';
import {
  BuilderInput,
  LocationRow,
  TypeRow,
  buildIdealistaFeed,
  htmlToText,
  resolveIdealistaType,
  splitPhone,
} from './idealista-builder';
import { guessIdealistaType, orientationKeys } from './idealista-catalog';

const settings: IdealistaExportSettings = {
  enabled: true,
  customerCode: 'ilc' + 'a'.repeat(40),
  country: 'Spain',
  contactName: 'Daniel Free',
  contactEmail: 'leads@cristihomes.com',
  contactPhone: '+34 600 111 222',
  addressVisibility: 'hidden',
  mode: 'own',
  propertyIds: [],
  propertyUrlPattern: 'https://cristihomes.com/en/property/{segment}',
};

const types = new Map<number, TypeRow>([
  [1, { id: 1, parentId: null, name: { en: 'Apartment' }, idealistaType: null }],
  [2, { id: 2, parentId: 1, name: { en: 'Penthouse' }, idealistaType: null }],
  [3, { id: 3, parentId: null, name: { en: 'House' }, idealistaType: 'house' }],
  [4, { id: 4, parentId: 3, name: { en: 'Something odd' }, idealistaType: null }],
  [5, { id: 5, parentId: null, name: { en: 'Plot' }, idealistaType: null }],
  [6, { id: 6, parentId: null, name: { en: 'Mystery' }, idealistaType: null }],
]);

const locations = new Map<number, LocationRow>([
  [10, { id: 10, parentId: null, level: 'province', name: { en: 'Málaga' }, lat: null, lng: null, postcode: null }],
  [11, { id: 11, parentId: 10, level: 'town', name: { en: 'Benalmádena Costa' }, lat: 36.59, lng: -4.53, postcode: '29630' }],
  [12, { id: 12, parentId: null, level: 'town', name: { en: 'Nowhere' }, lat: null, lng: null, postcode: null }],
]);

const features = new Map([
  [100, { id: 100, name: { en: 'Private Pool' } }],
  [101, { id: 101, name: { en: 'Air Conditioning' } }],
  [102, { id: 102, name: { en: 'South West' } }],
  [103, { id: 103, name: { en: 'Fully Furnished' } }],
]);

function prop(over: Partial<Property>): Property {
  return {
    id: 1,
    reference: 'R123',
    agentReference: 'CH20113',
    listingType: 'sale',
    propertyTypeId: 2,
    locationId: 11,
    price: 399950,
    bedrooms: 2,
    bathrooms: 2,
    buildSize: 85,
    plotSize: null,
    title: { en: 'Sea view penthouse' },
    description: { en: '<p>Great flat</p><p>Sea&nbsp;views &amp; pool</p>', es: 'Piso' },
    images: [
      { url: 'https://cdn.example.com/2.jpg', order: 2 },
      { url: 'https://cdn.example.com/1.jpg', order: 1 },
      { url: '/uploads/relative.jpg', order: 3 },
    ],
    features: [100, 101, 102, 103],
    videoUrl: 'https://www.youtube.com/watch?v=x',
    virtualTourUrl: 'https://my.matterport.com/show/?m=abc',
    energyRating: 'E',
    energyConsumption: 82.9,
    ...over,
  } as Property;
}

function run(properties: Property[]) {
  const input: BuilderInput = { settings, properties, types, locations, features, now: new Date('2026-10-07T10:00:00Z') };
  return buildIdealistaFeed(input);
}

describe('idealista builder', () => {
  it('builds a complete flat listing', () => {
    const { feed, included, skipped } = run([prop({})]);
    expect(skipped).toEqual([]);
    expect(included).toBe(1);
    expect(feed.customerSendDate).toBe('2026/10/07 10:00:00');
    expect(feed.customerContact).toEqual({
      contactName: 'Daniel Free',
      contactEmail: 'leads@cristihomes.com',
      contactPrimaryPhonePrefix: '34',
      contactPrimaryPhoneNumber: '600111222',
    });
    const p = (feed.customerProperties as any[])[0];
    expect(p.propertyCode).toBe('CH20113');
    expect(p.propertyReference).toBe('R123');
    expect(p.propertyOperation).toEqual({ operationType: 'sale', operationPrice: 399950 });
    expect(p.propertyFeatures).toMatchObject({
      featuresType: 'flat',
      featuresPenthouse: true,
      featuresAreaConstructed: 85,
      featuresBathroomNumber: 2,
      featuresBedroomNumber: 2,
      featuresPool: true,
      featuresConditionedAir: true,
      featuresOrientationSouth: true,
      featuresOrientationWest: true,
      featuresEnergyCertificateRating: 'E',
      featuresEnergyCertificatePerformance: 82.9,
    });
    // furnished only counts for rentals
    expect(p.propertyFeatures.featuresEquippedWithFurniture).toBeUndefined();
    expect(p.propertyAddress).toMatchObject({
      addressVisibility: 'hidden',
      addressTown: 'Benalmádena Costa',
      addressPostalCode: '29630',
      addressCountry: 'Spain',
      addressCoordinatesPrecision: 'moved',
    });
    expect(p.propertyImages).toEqual([
      { imageOrder: 1, imageUrl: 'https://cdn.example.com/1.jpg' },
      { imageOrder: 2, imageUrl: 'https://cdn.example.com/2.jpg' },
    ]);
    expect(p.propertyVideos).toBeUndefined(); // YouTube isn't accepted
    expect(p.propertyVirtualTours).toEqual({
      virtualTour3D: { virtualTour3DType: 'matterport', virtualTourUrl: 'https://my.matterport.com/show/?m=abc' },
    });
    expect(p.propertyDescriptions[0]).toEqual({ descriptionLanguage: 'english', descriptionText: 'Great flat\nSea views & pool' });
    expect(p.propertyUrl).toBe('https://cristihomes.com/en/property/sea-view-penthouse_R123');
  });

  it('flags listings that are sent but incomplete', () => {
    const { included, issues } = run([
      prop({ id: 1, reference: 'OK', images: Array.from({ length: 6 }, (_, i) => ({ url: `https://x.com/${i}.jpg`, order: i })) }),
      prop({ id: 2, reference: 'BARE', images: [], description: { en: 'Only English' }, energyRating: null, videoUrl: null }),
      prop({ id: 3, reference: 'FEW', images: [{ url: '/rel.jpg', order: 1 }, { url: 'https://x.com/a.jpg', order: 2 }] }),
    ]);
    expect(included).toBe(3);
    const byRef = Object.fromEntries(issues.map((i) => [i.reference, i.issues]));
    expect(byRef.OK).toEqual(['Video is not a video file (e.g. a YouTube link) — idealista only takes files, so it is left out']);
    expect(byRef.BARE).toEqual(['No photos', 'No Spanish description', 'No energy rating (required to advertise in Spain)']);
    expect(byRef.FEW).toEqual(expect.arrayContaining(['Only 1 photo', '1 photo has no full web address and is left out']));
  });

  it('skips listings idealista would reject, with a reason', () => {
    const { included, skipped } = run([
      prop({ id: 2, reference: 'A', bathrooms: null }),
      prop({ id: 3, reference: 'B', propertyTypeId: 6 }),
      prop({ id: 4, reference: 'C', price: null }),
      prop({ id: 5, reference: 'D', listingType: 'holiday_rent' }),
      prop({ id: 6, reference: 'E', locationId: 12 }),
      prop({ id: 7, reference: 'F', propertyTypeId: 5, plotSize: null }),
    ]);
    expect(included).toBe(0);
    expect(skipped.map((s) => s.reference)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(skipped[0].reason).toMatch(/bathrooms/i);
    expect(skipped[1].reason).toMatch(/idealista type/i);
    expect(skipped[4].reason).toMatch(/postcode/i);
  });

  it('exports land with only the plot size', () => {
    const { feed } = run([prop({ propertyTypeId: 5, plotSize: 1200, bathrooms: null, bedrooms: null })]);
    expect((feed.customerProperties as any[])[0].propertyFeatures).toEqual({ featuresType: 'land', featuresAreaPlot: 1200 });
  });

  it('keeps furnished for rentals with an equipped kitchen', () => {
    features.set(104, { id: 104, name: { en: 'Fitted Kitchen' } });
    const { feed } = run([prop({ listingType: 'rent', price: 1500, features: [103, 104] })]);
    const f = (feed.customerProperties as any[])[0].propertyFeatures;
    expect(f.featuresEquippedKitchen).toBe(true);
    expect(f.featuresEquippedWithFurniture).toBe(true);
  });

  it('resolves types: own setting, parent setting, then name guess', () => {
    expect(resolveIdealistaType(3, types)).toEqual({ value: 'house', source: 'set' });
    expect(resolveIdealistaType(4, types)).toEqual({ value: 'house', source: 'parent' });
    expect(resolveIdealistaType(2, types)).toEqual({ value: 'flat', source: 'guess' });
    expect(resolveIdealistaType(6, types)).toEqual({ value: null, source: null });
  });

  it('guesses like the Cristi Homes Odoo mapping', () => {
    expect(guessIdealistaType('Semi Detached')).toBe('house_semidetached');
    expect(guessIdealistaType('Townhouse')).toBe('house');
    expect(guessIdealistaType('Finca / Country Home')).toBe('house');
    expect(guessIdealistaType('Industrial Premisses')).toBe('premises_commercial');
    expect(guessIdealistaType('Bar / Cafe')).toBe('premises');
    expect(guessIdealistaType('Garage')).toBe('garage');
    expect(guessIdealistaType('Duplex Apartment')).toBe('flat');
    expect(guessIdealistaType('Detached Villa')).toBe('house_independent');
  });

  it('parses helpers', () => {
    expect(orientationKeys('North East')).toEqual(['featuresOrientationNorth', 'featuresOrientationEast']);
    expect(orientationKeys('Southern charm')).toEqual([]);
    expect(splitPhone('0044 7700 900123', 'Spain')).toEqual({ prefix: '44', number: '7700900123' });
    expect(splitPhone('952 123 456', 'Spain')).toEqual({ prefix: '34', number: '952123456' });
    expect(htmlToText('a<br>b&#233;')).toBe('a\nbé');
  });
});
