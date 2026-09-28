import axios from 'axios';
import { PROPERTY_TYPE_TEMPLATE_SEED } from './seed/property-type-template.seed';
import { locationKey } from '../location-template/location-name';
import { resolveType, TypeNodeLite, TypeTemplateIndex } from './property-type-template.resolver';
import { ResalesAdapter } from '../feed/adapters/resales.adapter';

jest.mock('axios');

const nodes: TypeNodeLite[] = PROPERTY_TYPE_TEMPLATE_SEED.map(([parent, name, codes, , aliases], i) => ({
  id: i + 1,
  parentId: parent >= 0 ? parent + 1 : null,
  name,
  nameKey: locationKey(name),
  codes,
  aliases,
  status: 'ok',
}));
const index = new TypeTemplateIndex(nodes);
const pathOf = (input: Parameters<typeof resolveType>[1]) => {
  const r = resolveType(index, input);
  return r ? [...index.path(r.node).map((n) => n.name), ...(r.extraName ? [`${r.extraName}+`] : [])] : null;
};

describe('resolveType (seeded from docs/property_types.csv)', () => {
  it('matches the Resales code first', () => {
    expect(pathOf({ name: 'Middle Floor Apartment', code: '1-4', parentName: 'Apartment', parentCode: '1-1' })).toEqual([
      'Apartment',
      'Middle Floor Apartment',
    ]);
  });

  it('"Finca - Cortijo" is the template\'s "Finca - Rural Estate" (same code 2-6, and an alias)', () => {
    expect(pathOf({ name: 'Finca - Cortijo', code: '2-6', parentCode: '2-1' })).toEqual(['House', 'Finca - Rural Estate']);
    expect(pathOf({ name: 'Finca - Cortijo' })).toEqual(['House', 'Finca - Rural Estate']);
  });

  it('both Beach Bar codes land on one type', () => {
    expect(pathOf({ code: '4-22' })).toEqual(['Commercial', 'Beach Bar']);
    expect(pathOf({ code: '4-23' })).toEqual(['Commercial', 'Beach Bar']);
  });

  it('matches by name when a feed sends no code (Kyero, Inmoba)', () => {
    expect(pathOf({ name: 'penthouse duplex' })).toEqual(['Apartment', 'Penthouse Duplex']);
    expect(pathOf({ name: 'Villa' })).toEqual(['House', 'Detached Villa']);
  });

  it('never makes "New Development" a type', () => {
    expect(resolveType(index, { name: 'New Development' })).toBeNull();
    expect(pathOf({ name: 'New Development', parentName: 'Apartment', parentCode: '1-1' })).toEqual(['Apartment']);
  });

  it('an unknown type goes under its group and is reported', () => {
    const r = resolveType(index, { name: 'Floating Home', code: '1-99', parentName: 'Apartment', parentCode: '1-1' })!;
    expect(r.node.name).toBe('Apartment');
    expect(r.extraName).toBe('Floating Home');
    expect(r.unmatched).toBe(true);
  });

  it('returns null when neither type nor group is known', () => {
    expect(resolveType(index, { name: 'Spaceship' })).toBeNull();
  });
});

// The listings below are the records the field survey returned for the
// Cristi Homes feed (filter 1).
describe('ResalesAdapter mapping', () => {
  const adapter = new ResalesAdapter() as any;
  const map = (raw: any) => adapter.mapProperty(raw, 'Sale');

  it('a development gets its real unit type and listing type "development"', () => {
    const p = map({
      Reference: 'R4600363',
      Location: 'Fuengirola',
      Province: 'Málaga',
      Area: 'Costa del Sol',
      PropertyType: {
        NameType: 'New Development', Type: 'Apartment', TypeId: '1-1',
        Subtype1: 'Ground Floor Apartment', SubtypeId1: '1-2', Subtype2: 'Middle Floor Apartment', SubtypeId2: '1-4',
      },
      KeyReady: 1,
      Price: '370000 - 545000',
      PropertyFeatures: { Category: [{ Type: 'Category', Value: ['New Development'] }] },
    });
    expect(p.listingType).toBe('development');
    expect(p.propertyType).toBe('Ground Floor Apartment');
    expect(p.propertyTypeCode).toBe('1-2');
    expect(p.propertyTypeGroup).toBe('Apartment');
    expect(p.propertyTypeGroupCode).toBe('1-1');
    expect(p.price).toBe(370000);
  });

  it('a resale stays "sale" with its subtype and code', () => {
    const p = map({
      Reference: 'R1',
      PropertyType: { NameType: 'Detached Villa', Type: 'House', TypeId: '2-1', Subtype1: 'Detached Villa', SubtypeId1: '2-2' },
      PropertyFeatures: { Category: [{ Type: 'Condition', Value: ['New Construction'] }] },
    });
    expect(p.listingType).toBe('sale');
    expect(p.propertyType).toBe('Detached Villa');
    expect(p.propertyTypeCode).toBe('2-2');
  });

  it('each development signal alone is enough', () => {
    const base = { Reference: 'R2', PropertyType: { NameType: 'Penthouse', Type: 'Apartment', TypeId: '1-1', Subtype1: 'Penthouse', SubtypeId1: '1-6' } };
    expect(map({ ...base, KeyReady: 1 }).listingType).toBe('development');
    expect(map({ ...base, PropertyFeatures: { Category: [{ Type: 'Category', Value: 'New Development' }] } }).listingType).toBe('development');
    expect(map(base).listingType).toBe('sale');
  });

  it('rentals keep their feed listing type', () => {
    const raw = { Reference: 'R3', PropertyType: { NameType: 'Penthouse', Subtype1: 'Penthouse', SubtypeId1: '1-6' } };
    expect(adapter.mapProperty(raw, 'Short Term Rental').listingType).toBe('holiday_rent');
    expect(adapter.mapProperty(raw, 'Long Term Rental').listingType).toBe('rent');
  });

  it('a development type maps through the template to the unit type', () => {
    const p = map({ Reference: 'R4', PropertyType: { NameType: 'New Development', Type: 'House', TypeId: '2-1', Subtype1: 'Semi-Detached House', SubtypeId1: '2-4' }, KeyReady: 1 });
    expect(pathOf({ name: p.propertyType, code: p.propertyTypeCode, parentName: p.propertyTypeGroup, parentCode: p.propertyTypeGroupCode })).toEqual([
      'House',
      'Semi-Detached House',
    ]);
  });
});

void axios;
