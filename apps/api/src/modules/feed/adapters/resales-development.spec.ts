import { ResalesAdapter } from './resales.adapter';

// New Developments API fields, shaped as Resales sent them live on 2026-10-07
// (PropertyDetails with p_pricelist / P_DecimalBaths / P_ShowGPSCoords).

const map = (raw: Record<string, unknown>) =>
  (new ResalesAdapter() as any).mapProperty({ Reference: 'R5480608', ...raw }, 'Sale');

const DEVELOPMENT = {
  NewDevName: 'Riviera Relleu',
  KeyReady: 0,
  Bedrooms: '1 - 3',
  Bathrooms: '2',
  Price: '96091 - 234530',
  PropertyType: { NameType: 'New Development', Type: 'Apartment', TypeId: '1-1', Subtype1: 'Ground Floor Apartment', SubtypeId1: '1-2' },
  PriceList: [
    { Name: 'Unit 14', Type: 'Top Floor Apartment', Price: 96091, BuiltSize: 43.01, Terrace: 0, Beds: 1, Baths: 2, KeyReady: 0, StatusText: 'Available', StatusCode: 'Available' },
    { Name: 'Unit 15', Type: 'Top Floor Apartment', Price: null, BuiltSize: 46.86, Terrace: 0, Beds: 1, Baths: 2, KeyReady: 0, StatusText: 'Sold', StatusCode: 'Sold' },
  ],
};

describe('Resales new developments', () => {
  it('reads the development name, key ready and the units price list', () => {
    const p = map(DEVELOPMENT);
    expect(p).toMatchObject({ listingType: 'development', developmentName: 'Riviera Relleu', keyReady: false, price: 96091, priceTo: 234530 });
    expect(p.units).toEqual([
      { name: 'Unit 14', type: 'Top Floor Apartment', price: 96091, builtSize: 43.01, terraceSize: 0, bedrooms: 1, bathrooms: 2, keyReady: false, status: 'available' },
      { name: 'Unit 15', type: 'Top Floor Apartment', price: null, builtSize: 46.86, terraceSize: 0, bedrooms: 1, bathrooms: 2, keyReady: false, status: 'sold' },
    ]);
  });

  it('marks a key-ready development', () => {
    expect(map({ ...DEVELOPMENT, KeyReady: 1, NewDevName: 'Suite Mijas II - KEY READY' })).toMatchObject({ keyReady: true });
  });

  it('leaves development fields off a resale listing', () => {
    const p = map({ PropertyType: { NameType: 'Detached Villa', Subtype1: 'Detached Villa' }, Price: '450000' });
    expect(p.developmentName).toBeUndefined();
    expect(p.keyReady).toBeUndefined();
    expect(p.units).toBeUndefined();
  });

  it('reads bed, bath and size ranges', () => {
    const p = map({ ...DEVELOPMENT, Bathrooms: '1 - 2', Built: '39 - 107', Terrace: '0 - 83', GardenPlot: '120' });
    expect(p).toMatchObject({ bedrooms: 1, bedroomsTo: 3, bathrooms: 1, bathroomsTo: 2, buildSize: 39, buildSizeTo: 107, terraceSize: 0, terraceSizeTo: 83, plotSize: 120 });
    expect(p.plotSizeTo).toBeUndefined();
    const single = map({ PropertyType: { NameType: 'Apartment' }, Bedrooms: '2', Built: '85' });
    expect(single).toMatchObject({ bedrooms: 2, buildSize: 85 });
    expect(single.bedroomsTo).toBeUndefined();
    expect(single.buildSizeTo).toBeUndefined();
  });

  it('keeps half baths', () => {
    expect(map({ PropertyType: { NameType: 'Apartment' }, Bathrooms: '2.5' }).bathrooms).toBe(2.5);
    expect(map({ ...DEVELOPMENT, Bathrooms: '1 - 2' }).bathrooms).toBe(1);
  });

  it('tells latitude from longitude in GpsX / GpsY', () => {
    expect(map({ GpsX: '-4.6262', GpsY: '36.5951' })).toMatchObject({ lat: 36.5951, lng: -4.6262 });
    expect(map({ GpsX: '36.5951', GpsY: '-4.6262' })).toMatchObject({ lat: 36.5951, lng: -4.6262 });
    const none = map({ GpsX: '0', GpsY: '0' });
    expect(none.lat).toBeUndefined();
    expect(none.lng).toBeUndefined();
    expect(map({ Latitude: '36.5', Longitude: '-4.9' })).toMatchObject({ lat: 36.5, lng: -4.9 });
  });
});
