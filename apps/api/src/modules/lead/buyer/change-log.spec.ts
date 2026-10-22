import { answerChanges, diffFields, sameValue, wishlistChanges } from './change-log';

describe('sameValue', () => {
  it('treats empty values alike', () => {
    expect(sameValue(null, undefined)).toBe(true);
    expect(sameValue('', null)).toBe(true);
    expect(sameValue([], null)).toBe(true);
    expect(sameValue('a', null)).toBe(false);
  });

  it('compares decimals as numbers', () => {
    expect(sameValue('400000.00', 400000)).toBe(true);
    expect(sameValue('400000.00', 400001)).toBe(false);
    expect(sameValue(0, '0')).toBe(true);
  });

  it('compares dates by day or instant', () => {
    expect(sameValue(new Date('2026-10-01T00:00:00Z'), '2026-10-01')).toBe(true);
    expect(sameValue('2026-10-01', '2026-10-02')).toBe(false);
  });

  it('compares id lists as sets', () => {
    expect(sameValue([3, 1, 2], [1, 2, 3])).toBe(true);
    expect(sameValue([1, 2], [1, 2, 3])).toBe(false);
  });

  it('compares objects by content', () => {
    expect(sameValue([{ name: 'A' }], [{ name: 'A' }])).toBe(true);
    expect(sameValue([{ name: 'A' }], [{ name: 'B' }])).toBe(false);
  });

  it('compares booleans with 0/1', () => {
    expect(sameValue(true, 1)).toBe(true);
    expect(sameValue(false, 0)).toBe(true);
  });
});

describe('diffFields', () => {
  it('lists only the fields that changed, with the raw values', () => {
    const before = { firstName: 'Ann', lastName: 'Lee', priority: 1, dealValue: '1000.00', city: null };
    const after = { firstName: 'Anne', lastName: 'Lee', priority: 1, dealValue: 1000, city: 'Marbella' };
    expect(diffFields(before, after, ['firstName', 'lastName', 'priority', 'dealValue', 'city'])).toEqual([
      { field: 'firstName', from: 'Ann', to: 'Anne' },
      { field: 'city', from: null, to: 'Marbella' },
    ]);
  });

  it('skips fields missing from after (not sent = not changed)', () => {
    expect(diffFields({ a: 1, b: 2 }, { a: 2 }, ['a', 'b'])).toEqual([{ field: 'a', from: 1, to: 2 }]);
  });

  it('prefixes nested fields', () => {
    expect(diffFields({ budgetMax: 400000, locationIds: [1] }, { budgetMax: 450000, locationIds: [1] }, ['budgetMax', 'locationIds'], 'wishlist.')).toEqual([
      { field: 'wishlist.budgetMax', from: 400000, to: 450000 },
    ]);
  });

  it('handles null objects', () => {
    expect(diffFields(null, { minBedrooms: 2 }, ['minBedrooms'], 'wishlist.')).toEqual([{ field: 'wishlist.minBedrooms', from: null, to: 2 }]);
  });
});

describe('wishlistChanges / answerChanges', () => {
  it('reports removed and changed wishlist keys', () => {
    expect(wishlistChanges({ budgetMax: 400000, locationIds: [1, 2], minBedrooms: 3 }, { budgetMax: 450000, locationIds: [2, 1] })).toEqual([
      { field: 'wishlist.minBedrooms', from: 3, to: null },
      { field: 'wishlist.budgetMax', from: 400000, to: 450000 },
    ]);
    expect(wishlistChanges(null, null)).toEqual([]);
  });

  it('reports each changed answer', () => {
    expect(answerChanges({ purpose: ['holiday'], found_us: ['google'] }, { purpose: ['holiday'], timeframe: ['3m'] })).toEqual([
      { field: 'answers.found_us', from: ['google'], to: null },
      { field: 'answers.timeframe', from: null, to: ['3m'] },
    ]);
  });
});
