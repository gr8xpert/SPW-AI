import { wishlistAccepts, type ReverseListing } from './reverse-match';

const villa: ReverseListing = {
  listingType: 'sale', locationId: 11, propertyTypeId: 5, price: 450000, priceTo: null, priceOnRequest: false, status: 'active', isPublished: true,
};
const ctx = { places: null as Set<number> | null, types: null as Set<number> | null, siteTypes: null as string[] | null, minPrices: null as Record<string, number> | null };

describe('wishlistAccepts', () => {
  it('an empty wishlist accepts nothing (no wishlist = no match)', () => {
    expect(wishlistAccepts({}, villa, ctx)).toBe(false);
  });

  it('listing type, with the site limits', () => {
    expect(wishlistAccepts({ listingTypes: ['sale'] }, villa, ctx)).toBe(true);
    expect(wishlistAccepts({ listingTypes: ['rent'] }, villa, ctx)).toBe(false);
    expect(wishlistAccepts({ budgetMax: 500000 }, villa, { ...ctx, siteTypes: ['rent'] })).toBe(false);
    expect(wishlistAccepts({ listingTypes: ['sale'] }, villa, { ...ctx, siteTypes: ['rent', 'sale'] })).toBe(true);
  });

  it('places and types with everything below them (expanded sets)', () => {
    expect(wishlistAccepts({ locationIds: [10] }, villa, { ...ctx, places: new Set([10, 11]) })).toBe(true);
    expect(wishlistAccepts({ locationIds: [12] }, villa, { ...ctx, places: new Set([12]) })).toBe(false);
    expect(wishlistAccepts({ propertyTypeIds: [4] }, villa, { ...ctx, types: new Set([4, 5]) })).toBe(true);
    expect(wishlistAccepts({ propertyTypeIds: [6] }, villa, { ...ctx, types: new Set([6]) })).toBe(false);
  });

  it('budget overlaps the price (or a development range)', () => {
    expect(wishlistAccepts({ budgetMin: 400000, budgetMax: 500000 }, villa, ctx)).toBe(true);
    expect(wishlistAccepts({ budgetMax: 400000 }, villa, ctx)).toBe(false);
    expect(wishlistAccepts({ budgetMin: 500000 }, villa, ctx)).toBe(false);
    expect(wishlistAccepts({ budgetMin: 500000 }, { ...villa, priceTo: 600000 }, ctx)).toBe(true);
  });

  it('a listing without a price never matches a budget', () => {
    expect(wishlistAccepts({ budgetMax: 900000 }, { ...villa, priceOnRequest: true }, ctx)).toBe(false);
    expect(wishlistAccepts({ budgetMax: 900000 }, { ...villa, price: null }, ctx)).toBe(false);
    expect(wishlistAccepts({ listingTypes: ['sale'] }, { ...villa, price: null }, ctx)).toBe(true);
  });

  it("the site's price floor hides cheap listings", () => {
    expect(wishlistAccepts({ listingTypes: ['sale'] }, villa, { ...ctx, minPrices: { sale: 500000 } })).toBe(false);
    expect(wishlistAccepts({ listingTypes: ['sale'] }, { ...villa, priceOnRequest: true }, { ...ctx, minPrices: { sale: 500000 } })).toBe(true);
  });

  it('only live listings', () => {
    expect(wishlistAccepts({ listingTypes: ['sale'] }, { ...villa, status: 'sold' }, ctx)).toBe(false);
    expect(wishlistAccepts({ listingTypes: ['sale'] }, { ...villa, isPublished: false }, ctx)).toBe(false);
  });
});
