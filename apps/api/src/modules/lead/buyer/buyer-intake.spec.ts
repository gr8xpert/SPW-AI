import { guessWishlist, mergeGuess, pickRotationAgent, townOf, type GuessProperty, type PlaceRow } from './buyer-intake';

const places: PlaceRow[] = [
  { id: 1, parentId: null, level: 'province' },
  { id: 2, parentId: 1, level: 'area' },
  { id: 3, parentId: 2, level: 'town' },
  { id: 4, parentId: 3, level: 'urbanization' },
  { id: 5, parentId: 4, level: 'urbanization' },
  { id: 8, parentId: 9, level: 'urbanization' },
  { id: 9, parentId: 8, level: 'urbanization' },
];
const byId = new Map(places.map((p) => [p.id, p]));

const villa: GuessProperty = {
  listingType: 'sale', propertyTypeId: 10, locationId: 4, price: 500000, priceTo: null, priceOnRequest: false, bedrooms: 4, currency: 'EUR',
};

describe('townOf', () => {
  it('walks an urbanization up to its town', () => {
    expect(townOf(4, byId)).toBe(3);
    expect(townOf(5, byId)).toBe(3);
  });
  it('keeps a town, and a place above town level', () => {
    expect(townOf(3, byId)).toBe(3);
    expect(townOf(2, byId)).toBe(2);
  });
  it('keeps the place when no town is above it, and survives a cycle', () => {
    expect(townOf(8, byId)).toBe(8);
    expect(townOf(77, byId)).toBe(77);
  });
});

describe('guessWishlist', () => {
  const town = (id: number | null) => (id == null ? null : townOf(id, byId));

  it('guesses type, town, price ±20% and bedrooms from one enquiry', () => {
    expect(guessWishlist([villa], town)).toEqual({
      listingTypes: ['sale'],
      propertyTypeIds: [10],
      locationIds: [3],
      budgetMin: 400000,
      budgetMax: 600000,
      minBedrooms: 4,
      currency: 'EUR',
      guessed: true,
    });
  });

  it('spans several properties: min price, max priceTo, lowest bedrooms', () => {
    const dev: GuessProperty = { ...villa, listingType: 'development', propertyTypeId: 11, locationId: 2, price: '300000.00', priceTo: '450000.00', bedrooms: 2 };
    const g = guessWishlist([villa, dev], town)!;
    expect(g.listingTypes).toEqual(['sale', 'development']);
    expect(g.propertyTypeIds).toEqual([10, 11]);
    expect(g.locationIds).toEqual([3, 2]);
    expect(g.budgetMin).toBe(240000);
    expect(g.budgetMax).toBe(600000);
    expect(g.minBedrooms).toBe(2);
  });

  it('skips price-on-request and unpriced listings for the budget, and 0 bedrooms', () => {
    const poa = { ...villa, price: 900000, priceOnRequest: true, bedrooms: 0 };
    const free = { ...villa, price: null, bedrooms: null };
    const g = guessWishlist([poa, free], town)!;
    expect(g.budgetMin).toBeUndefined();
    expect(g.budgetMax).toBeUndefined();
    expect(g.minBedrooms).toBeUndefined();
    expect(g.listingTypes).toEqual(['sale']);
  });

  it('ignores unknown listing types and returns null for nothing to go on', () => {
    expect(guessWishlist([], town)).toBeNull();
    const odd = { ...villa, listingType: 'auction', propertyTypeId: null, locationId: null, price: null, bedrooms: null };
    expect(guessWishlist([odd], town)).toBeNull();
  });
});

describe('mergeGuess', () => {
  it('unions the lists, widens the budget, keeps the lower bedrooms', () => {
    const merged = mergeGuess(
      { listingTypes: ['sale'], propertyTypeIds: [10], locationIds: [3], budgetMin: 400000, budgetMax: 600000, minBedrooms: 4, currency: 'EUR', guessed: true },
      { listingTypes: ['rent'], propertyTypeIds: [10, 12], locationIds: [7], budgetMin: 1000, budgetMax: 2000, minBedrooms: 2, currency: 'EUR', guessed: true },
    );
    expect(merged).toEqual({
      listingTypes: ['sale', 'rent'],
      propertyTypeIds: [10, 12],
      locationIds: [3, 7],
      budgetMin: 1000,
      budgetMax: 600000,
      minBedrooms: 2,
      currency: 'EUR',
      guessed: true,
    });
  });

  it('keeps the known budget when the other side has none', () => {
    const merged = mergeGuess({ budgetMin: 1, budgetMax: 2, guessed: true }, { listingTypes: ['sale'], guessed: true });
    expect(merged.budgetMin).toBe(1);
    expect(merged.budgetMax).toBe(2);
    expect(mergeGuess(null, { minBedrooms: 3, guessed: true })).toEqual({ minBedrooms: 3, guessed: true });
  });
});

describe('pickRotationAgent', () => {
  it('gives a never-assigned agent first, in rotation order', () => {
    expect(pickRotationAgent([5, 6, 7], new Map([[5, 40]]))).toBe(6);
  });
  it('else the agent whose latest automatic buyer is oldest', () => {
    expect(pickRotationAgent([5, 6], new Map([[5, 41], [6, 40]]))).toBe(6);
  });
  it('breaks ties by rotation order and returns null for an empty rotation', () => {
    expect(pickRotationAgent([6, 5], new Map([[5, 40], [6, 40]]))).toBe(6);
    expect(pickRotationAgent([], new Map())).toBeNull();
  });
});
