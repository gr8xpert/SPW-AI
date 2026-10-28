import { cleanKeyScope, keyScopeTag, scopedListingTypes, trimToScope } from './key-scope';

describe('key-scope', () => {
  it('keeps only what a scope can mean', () => {
    expect(
      cleanKeyScope({
        locationIds: [5, '7', -1, 'x', 5],
        listingTypes: ['development', 'villa'],
        features: [3],
        priceMin: '500000',
        priceMax: 100,
        ownOnly: 'yes',
        excludeRefs: [' R1 ', '', 9],
        extra: true,
      }),
    ).toEqual({ locationIds: [5, 7], listingTypes: ['development'], features: [3], featureMatch: 'all', priceMin: 500000, excludeRefs: ['R1'] });
  });

  it('treats an empty or all-types scope as no scope', () => {
    expect(cleanKeyScope({})).toBeNull();
    expect(cleanKeyScope(null)).toBeNull();
    expect(cleanKeyScope([1])).toBeNull();
    expect(cleanKeyScope({ listingTypes: ['sale', 'rent', 'holiday_rent', 'development'] })).toBeNull();
  });

  it('combines the site and key listing types', () => {
    expect(scopedListingTypes(null, null)).toBeNull();
    expect(scopedListingTypes(['sale'], null)).toEqual(['sale']);
    expect(scopedListingTypes(null, { listingTypes: ['development'] })).toEqual(['development']);
    expect(scopedListingTypes(['sale', 'development'], { listingTypes: ['development'] })).toEqual(['development']);
    expect(scopedListingTypes(['rent'], { listingTypes: ['development'] })).toEqual(['none']);
  });

  it('trims a tree to the picked places, their children and parents', () => {
    const items = [
      { id: 1, parentId: null },
      { id: 2, parentId: 1 },
      { id: 3, parentId: 2 },
      { id: 4, parentId: 1 },
      { id: 5, parentId: null },
    ];
    expect(trimToScope(items, [2]).map((i) => i.id)).toEqual([1, 2, 3]);
    expect(trimToScope(items, undefined)).toBe(items);
  });

  it('tags equal scopes alike and no scope as empty', () => {
    expect(keyScopeTag(null)).toBe('');
    expect(keyScopeTag({ locationIds: [1] })).toBe(keyScopeTag({ locationIds: [1] }));
    expect(keyScopeTag({ locationIds: [1] })).not.toBe(keyScopeTag({ locationIds: [2] }));
  });
});
