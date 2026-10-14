import type { Property } from '../../../database/entities';
import {
  RmContext,
  RmLocationRow,
  RmPlace,
  RmTypeRow,
  buildRightmoveProperty,
  cleanText,
  emptyGazetteer,
  indexGazetteer,
  isSkipped,
  placeKey,
  resolveRightmoveType,
  rmDate,
} from './rightmove-builder';
import { guessRightmoveType } from './rightmove-catalog';
import { parseResponse } from './rightmove-client';

const types = new Map<number, RmTypeRow>([
  [1, { id: 1, parentId: null, name: { en: 'Villa' }, rightmoveType: null }],
  [2, { id: 2, parentId: null, name: { en: 'Apartment' }, rightmoveType: '8' }],
  [3, { id: 3, parentId: 2, name: { en: 'Something odd' }, rightmoveType: null }],
  [4, { id: 4, parentId: null, name: { en: 'Thing' }, rightmoveType: null }],
]);

const locations = new Map<number, RmLocationRow>([
  [10, { id: 10, parentId: null, level: 'region', name: { en: 'Andalucía' }, rightmoveLocationId: null }],
  [11, { id: 11, parentId: 10, level: 'province', name: { en: 'Málaga' }, rightmoveLocationId: null }],
  [12, { id: 12, parentId: 11, level: 'town', name: { en: 'Benalmádena' }, rightmoveLocationId: null }],
  [13, { id: 13, parentId: 12, level: 'urbanization', name: { en: 'Reserva del Higuerón' }, rightmoveLocationId: null }],
  [14, { id: 14, parentId: 11, level: 'town', name: { en: 'Carvajal' }, rightmoveLocationId: null }],
]);

const places: RmPlace[] = [
  { id: 100, region: 'Andalucia', subRegion: 'Malaga', town: 'Benalmadena', townKey: placeKey('Benalmadena') },
  { id: 101, region: 'Andalucia', subRegion: 'Malaga', town: 'Fuengirola', townKey: placeKey('Fuengirola') },
];

const ctx = (patch: Partial<RmContext> = {}): RmContext => ({
  settings: { enabled: true, networkId: 218486, branchId: 428242, mode: 'own', propertyIds: [], includeSpanish: true },
  types,
  locations,
  features: new Map<number, { id: number; name: Record<string, string> }>([
    [1, { id: 1, name: { en: 'Private Pool', es: 'Piscina privada' } }],
    [2, { id: 2, name: { en: 'Sea Views', es: 'Vistas al mar' } }],
    [3, { id: 3, name: { en: 'Air Conditioning' } }],
  ]),
  gazetteer: indexGazetteer(places),
  ...patch,
});

const property = (patch: Partial<Property> = {}): Property =>
  ({
    id: 1,
    reference: 'R5063266',
    agentReference: 'T3667',
    listingType: 'sale',
    price: 495000,
    currency: 'EUR',
    priceOnRequest: false,
    propertyTypeId: 1,
    locationId: 13,
    bedrooms: 3,
    bathrooms: 2,
    buildSize: 180,
    plotSize: 600,
    builtYear: 2005,
    features: [1, 2, 3],
    images: [
      { url: 'https://cdn.example.com/2.jpg', order: 2 },
      { url: 'https://cdn.example.com/1.jpg', order: 1 },
      { url: '/uploads/local.jpg', order: 3 },
    ],
    floorPlans: [{ url: 'https://cdn.example.com/plan.pdf', label: 'Ground floor' }],
    virtualTourUrl: 'https://my.matterport.com/show/?m=abc',
    description: { en: '<p>Villa with sea views &amp; sun.</p>', es: 'Villa con vistas al mar.' },
    lat: 36.59,
    lng: -4.56,
    createdAt: new Date(Date.UTC(2026, 0, 2, 3, 4, 5)),
    updatedAt: new Date(Date.UTC(2026, 9, 13, 16, 26, 3)),
    ...patch,
  }) as unknown as Property;

const build = (p: Partial<Property> = {}, c: Partial<RmContext> = {}) => buildRightmoveProperty(property(p), ctx(c));

describe('rightmove builder', () => {
  it('builds the OverseasSendProperty request', () => {
    const r = build();
    if (isSkipped(r)) throw new Error(r.reason);
    const prop = r.payload.property as Record<string, any>;
    expect(r.payload.network).toEqual({ network_id: 218486 });
    expect(r.payload.branch).toEqual({ branch_id: 428242 });
    // The Resales reference, as the old Odoo feed sent — not the agent's own.
    expect(prop.agent_ref).toBe('R5063266');
    expect(prop.property_type).toBe(27);
    expect(prop.os_status).toBe(1);
    expect(prop.new_home).toBe(false);
    expect(prop.price_information).toEqual({ price: 495000 });
    expect(prop.address).toEqual({
      country_code: 'ES',
      region: 'Andalucia',
      sub_region: 'Malaga',
      town_city: 'Benalmadena',
      latitude: 36.59,
      longitude: -4.56,
    });
    expect(prop.details.summary).toBe('Villa with sea views & sun.');
    expect(prop.details.description).toBe('Villa with sea views & sun.\n\nVilla con vistas al mar.');
    expect(prop.details).toMatchObject({
      bedrooms: 3,
      bathrooms: 2,
      internal_area: 180,
      internal_area_unit: 2,
      land_area: 600,
      year_built: 2005,
      private_pool: true,
      sea_view: true,
      air_conditioning: true,
      features: ['Private Pool', 'Sea Views', 'Air Conditioning'],
    });
    expect(prop.media.map((m: any) => [m.media_type, m.media_url, m.sort_order])).toEqual([
      [1, 'https://cdn.example.com/1.jpg', 1],
      [1, 'https://cdn.example.com/2.jpg', 2],
      [2, 'https://cdn.example.com/plan.pdf', 3],
      [4, 'https://my.matterport.com/show/?m=abc', 4],
    ]);
    expect(prop.create_date).toBe('02-01-2026 03:04:05');
    expect(prop.update_date).toBe('13-10-2026 16:26:03');
    expect(r.issues).toEqual([]);
  });

  it('keeps the hash when only the save time changes', () => {
    const a = build();
    const b = build({ updatedAt: new Date() });
    const c = build({ price: 490000 });
    if (isSkipped(a) || isSkipped(b) || isSkipped(c)) throw new Error('skipped');
    expect(b.hash).toBe(a.hash);
    expect(c.hash).not.toBe(a.hash);
  });

  it('skips what Rightmove Overseas does not take', () => {
    const reason = (p: Partial<Property>) => {
      const r = build(p);
      return isSkipped(r) ? r.reason : null;
    };
    expect(reason({ listingType: 'rent' as any })).toMatch(/sales only/);
    expect(reason({ listingType: 'holiday_rent' as any })).toMatch(/sales only/);
    expect(reason({ priceOnRequest: true })).toMatch(/Price on request/);
    expect(reason({ price: null })).toBe('No price');
    expect(reason({ currency: 'GBP' })).toMatch(/euros/);
    expect(reason({ propertyTypeId: 4 })).toMatch(/no Rightmove type/);
    expect(reason({ description: { es: 'Solo español' } })).toMatch(/No English/);
  });

  it('marks developments as new homes', () => {
    const r = build({ listingType: 'development' as any });
    if (isSkipped(r)) throw new Error(r.reason);
    expect((r.payload.property as any).new_home).toBe(true);
  });

  it('reports towns Rightmove does not know, and honours a hand-set link', () => {
    const r = build({ locationId: 14 });
    if (isSkipped(r)) throw new Error(r.reason);
    expect((r.payload.property as any).address).toEqual({
      country_code: 'ES',
      region: 'Andalucía',
      sub_region: 'Málaga',
      latitude: 36.59,
      longitude: -4.56,
    });
    expect(r.issues[0]).toMatch(/"Carvajal" is not in Rightmove's place list — sent with region only/);

    const linked = new Map(locations);
    linked.set(14, { ...locations.get(14)!, rightmoveLocationId: 101 });
    const r2 = build({ locationId: 14 }, { locations: linked });
    if (isSkipped(r2)) throw new Error(r2.reason);
    expect((r2.payload.property as any).address.town_city).toBe('Fuengirola');
    expect(r2.issues).toEqual([]);
  });

  it('sends our own names while the place list is not loaded', () => {
    const r = build({}, { gazetteer: emptyGazetteer() });
    if (isSkipped(r)) throw new Error(r.reason);
    expect((r.payload.property as any).address).toMatchObject({ region: 'Andalucía', sub_region: 'Málaga', town_city: 'Benalmádena' });
    expect(r.issues[0]).toMatch(/place list isn't loaded/);
  });

  it('takes region names from the tree when the place list is towns only (old Odoo list + aliases)', () => {
    const odoo = indexGazetteer([
      { id: 200, region: '', subRegion: null, town: 'Mijas Golf', townKey: placeKey('Mijas Golf') },
      { id: 201, region: '', subRegion: null, town: 'Mijas Golf', townKey: placeKey('Reserva del Higuerón') },
    ]);
    const r = build({ locationId: 13 }, { gazetteer: odoo });
    if (isSkipped(r)) throw new Error(r.reason);
    expect((r.payload.property as any).address).toMatchObject({ region: 'Andalucía', sub_region: 'Málaga', town_city: 'Mijas Golf' });
    expect(r.issues).toEqual([]);
  });

  it('guesses the codes the old Odoo feed sent', () => {
    const t = (name: string) => guessRightmoveType(name);
    expect(t('Ground Floor Apartment')).toBe('8');
    expect(t('Middle Floor Apartment')).toBe('8');
    expect(t('Ground Floor Studio')).toBe('9');
    expect(t('Penthouse Duplex')).toBe('29');
    expect(t('Detached Villa')).toBe('27');
    expect(t('Finca - Cortijo')).toBe('104');
    expect(t('Finca Rural Estate')).toBe('30');
    expect(t('Wooden House')).toBe('26');
    expect(t('Residential Plot')).toBe('110');
    expect(t('Garage')).toBe('196');
    expect(t('Bar')).toBe('211');
    expect(t('Commercial Premises')).toBe('253');
    expect(t('Apartment Complex')).toBe('253');
    expect(t('Other')).toBe('268');
  });

  it('leaves the plot off flats and sends English only when Spanish is off', () => {
    const r = build({ propertyTypeId: 2 }, { settings: { ...ctx().settings, includeSpanish: false } });
    if (isSkipped(r)) throw new Error(r.reason);
    const d = (r.payload.property as any).details;
    expect(d.land_area).toBeUndefined();
    expect(d.description).toBe('Villa with sea views & sun.');
  });

  it('resolves types from the parent, else a guess', () => {
    expect(resolveRightmoveType(2, types)).toEqual({ value: '8', source: 'set' });
    expect(resolveRightmoveType(3, types)).toEqual({ value: '8', source: 'parent' });
    expect(resolveRightmoveType(1, types)).toEqual({ value: '27', source: 'guess' });
    expect(resolveRightmoveType(4, types)).toEqual({ value: null, source: null });
  });

  it('strips contact details but keeps prices', () => {
    expect(cleanText('Call +34 600 123 456 or 952 123 456, mail info@agency.es, see www.agency.es')).toBe('Call or , mail , see');
    expect(cleanText('Reduced to 495 000 € — was 600 000 €')).toBe('Reduced to 495 000 € — was 600 000 €');
  });

  it('formats dates the way Rightmove wants', () => {
    expect(rmDate(new Date(Date.UTC(2026, 9, 3, 9, 5, 7)))).toBe('03-10-2026 09:05:07');
    expect(rmDate(null)).toBeUndefined();
  });
});

describe('rightmove response parsing', () => {
  it('reads a send response like the ones the old feed got', () => {
    const r = parseResponse(
      200,
      JSON.stringify({
        request_id: '428242-261013-172603-75246',
        message: 'Your property has successfully been uploaded to Rightmove',
        success: true,
        property: { agent_ref: 'R4913446', rightmove_id: 162006578, rightmove_url: 'https://www.rightmove.com/properties/162006578', change_type: 'UPDATE' },
        errors: [],
        warnings: [{ warning_code: 'INT_00008', warning_value: null, warning_description: 'media error' }],
      }),
      12,
    );
    expect(r).toMatchObject({
      ok: true,
      rightmoveId: '162006578',
      rightmoveUrl: 'https://www.rightmove.com/properties/162006578',
      changeType: 'UPDATE',
      warnings: [{ code: 'INT_00008', description: 'media error', value: null }],
    });
  });

  it('treats non-JSON and failed answers as errors', () => {
    expect(parseResponse(403, '<html>Forbidden</html>', 5)).toMatchObject({ ok: false, httpStatus: 403 });
    const failed = parseResponse(200, JSON.stringify({ success: false, message: 'Invalid', errors: [{ error_code: 'SYN_001', error_description: 'bad' }] }), 5);
    expect(failed).toMatchObject({ ok: false, errors: [{ code: 'SYN_001', description: 'bad' }] });
  });

  it('reads the branch property list', () => {
    const r = parseResponse(200, JSON.stringify({ success: true, message: 'ok', property: [{ agent_ref: 'R1', rightmove_id: 5, update_date: '01-01-2026 00:00:00' }] }), 5);
    expect(r.properties).toEqual([{ agentRef: 'R1', rightmoveId: '5', updateDate: '01-01-2026 00:00:00' }]);
  });
});
