import { DEFAULT_BUYER_MATCH_WEIGHTS } from '@spm/shared';
import { cleanWishlist, isEmptyWishlist, matchListingTypes, scoreProperty, type ScoredFields } from './buyer-match';

const W = DEFAULT_BUYER_MATCH_WEIGHTS;
const villa: ScoredFields = { bedrooms: 4, bathrooms: 3, buildSize: '250.00', plotSize: '1000.00', features: [1, 2, 3] };

describe('cleanWishlist', () => {
  it('coerces numbers, dedupes ids and drops junk', () => {
    expect(
      cleanWishlist({
        listingTypes: ['sale', 'sale', 'castle'],
        locationIds: ['5', 5, -1, 'x'],
        propertyTypeIds: [],
        minBedrooms: '3',
        budgetMax: 450000,
        budgetMin: 0,
        maxPlotSize: 'abc',
        featureIds: [7],
        sendMatchesTo: 'both',
        guessed: 1,
        extra: true,
      }),
    ).toEqual({ listingTypes: ['sale'], locationIds: [5], minBedrooms: 3, budgetMax: 450000, featureIds: [7], sendMatchesTo: 'both', guessed: true });
  });

  it('handles null and non-objects', () => {
    expect(cleanWishlist(null)).toEqual({});
    expect(cleanWishlist('x')).toEqual({});
  });

  it('knows an empty wishlist', () => {
    expect(isEmptyWishlist({ sendMatchesTo: 'buyer', guessed: false })).toBe(true);
    expect(isEmptyWishlist({ minBedrooms: 2 })).toBe(false);
  });
});

describe('matchListingTypes', () => {
  it('limits the buyer types to the site types', () => {
    expect(matchListingTypes({ listingTypes: ['sale', 'rent'] }, ['sale'])).toEqual(['sale']);
    expect(matchListingTypes({ listingTypes: ['rent'] }, ['sale'])).toEqual([]);
    expect(matchListingTypes({}, ['sale'])).toEqual(['sale']);
    expect(matchListingTypes({}, null)).toBeNull();
    expect(matchListingTypes({ listingTypes: ['development'] }, null)).toEqual(['development']);
  });
});

describe('scoreProperty', () => {
  it('is 100 when no wishes are asked', () => {
    expect(scoreProperty({ locationIds: [1] }, villa, W)).toEqual({ score: 100, met: [], missed: [] });
  });

  it('weighs met and missed wishes', () => {
    // beds 3 (met), baths 4 (missed, weight 2), feature 9 missed (1), feature 1 met (1)
    const r = scoreProperty({ minBedrooms: 3, minBathrooms: 4, featureIds: [1, 9] }, villa, W);
    expect(r.met).toEqual(['bedrooms', 'feature:1']);
    expect(r.missed).toEqual(['bathrooms', 'feature:9']);
    expect(r.score).toBe(Math.round((100 * (3 + 1)) / (3 + 2 + 1 + 1)));
  });

  it('uses a feature override', () => {
    const weights = { ...W, featureOverrides: { '9': 6 } };
    const r = scoreProperty({ featureIds: [1, 9] }, villa, weights);
    expect(r.score).toBe(Math.round((100 * 1) / 7));
  });

  it('is 100 when every asked wish weighs 0', () => {
    expect(scoreProperty({ featureIds: [9] }, villa, { ...W, feature: 0 }).score).toBe(100);
  });

  it('reads a development range by its high end', () => {
    const dev: ScoredFields = { bedrooms: 1, bedroomsTo: 3, bathrooms: 1, bathroomsTo: null, buildSize: 60, buildSizeTo: 120, plotSize: null, features: null };
    const r = scoreProperty({ minBedrooms: 3, minBuildSize: 100, maxBuildSize: 110 }, dev, W);
    expect(r.met).toEqual(['bedrooms', 'buildSize']);
    expect(r.score).toBe(100);
  });

  it('counts a missing size or a size outside the range as missed', () => {
    const r = scoreProperty({ minPlotSize: 500, maxBuildSize: 200 }, { ...villa, plotSize: null }, W);
    expect(r.missed).toEqual(['buildSize', 'plotSize']);
    expect(r.score).toBe(0);
  });
});
