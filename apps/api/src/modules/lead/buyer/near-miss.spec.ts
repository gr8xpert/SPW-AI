import { distanceKm, nearbyTowns, nearMissOf, townOf, wishReasons, type Place } from './near-miss';

// Andalucía (1) > Costa del Sol (2) > Marbella (10, town) > Nueva Andalucía (11, urbanization)
//                                  > Benahavís (12, town, 8 km from Marbella)
//                                  > Estepona (13, town, 25 km)
//                                  > Istán (14, town, no coordinates)
const places: Place[] = [
  { id: 1, parentId: null, level: 'region', lat: null, lng: null, name: 'Andalucía' },
  { id: 2, parentId: 1, level: 'area', lat: null, lng: null, name: 'Costa del Sol' },
  { id: 10, parentId: 2, level: 'town', lat: 36.5101, lng: -4.8825, name: 'Marbella' },
  { id: 11, parentId: 10, level: 'urbanization', lat: null, lng: null, name: 'Nueva Andalucía' },
  { id: 12, parentId: 2, level: 'town', lat: 36.5212, lng: -4.9856, name: 'Benahavís' },
  { id: 13, parentId: 2, level: 'town', lat: 36.4276, lng: -5.1463, name: 'Estepona' },
  { id: 14, parentId: 2, level: 'town', lat: null, lng: null, name: 'Istán' },
];
const byId = new Map(places.map((p) => [p.id, p]));
const T = { budgetPercent: 10, nearbyKm: 10 };

describe('townOf / distanceKm', () => {
  it('walks up to the town', () => {
    expect(townOf(11, byId)?.id).toBe(10);
    expect(townOf(10, byId)?.id).toBe(10);
    expect(townOf(2, byId)).toBeNull();
  });

  it('measures km between coordinates', () => {
    expect(Math.round(distanceKm(byId.get(10)!, byId.get(12)!)!)).toBe(9);
    expect(distanceKm(byId.get(10)!, byId.get(14)!)).toBeNull();
  });
});

describe('nearbyTowns', () => {
  it('towns within the distance, or siblings without coordinates; never the wished one', () => {
    const near = nearbyTowns([10], byId, 10);
    expect([...near.keys()].sort()).toEqual([12, 14]);
    expect(Math.round(near.get(12)!.km!)).toBe(9);
    expect(near.get(14)!.km).toBeNull();
  });

  it('a place above town level adds nothing', () => {
    expect(nearbyTowns([2], byId, 10).size).toBe(0);
  });

  it('distance 0 turns it off', () => {
    expect(nearbyTowns([10], byId, 0).size).toBe(0);
  });
});

describe('nearMissOf', () => {
  const near = nearbyTowns([10], byId, 10);
  const inWished = (loc: number | null) => loc === 10 || loc === 11;
  const ctx = { inWished, nearby: near, byId };

  it('€15k over a 400k budget is a near miss at 10 %', () => {
    expect(nearMissOf({ budgetMax: 400000, locationIds: [10] }, { price: 415000, priceTo: null, locationId: 11 }, ctx, T)).toEqual({ code: 'over_budget', amount: 15000 });
  });

  it('too far over the budget is not', () => {
    expect(nearMissOf({ budgetMax: 400000 }, { price: 450000, priceTo: null, locationId: 10 }, ctx, T)).toBeNull();
  });

  it('under the minimum budget', () => {
    expect(nearMissOf({ budgetMin: 300000 }, { price: 280000, priceTo: null, locationId: 10 }, ctx, T)).toEqual({ code: 'under_budget', amount: 20000 });
  });

  it('a development range overlapping the budget is a match, not a miss', () => {
    expect(nearMissOf({ budgetMax: 400000 }, { price: 380000, priceTo: 500000, locationId: 10 }, ctx, T)).toBeNull();
  });

  it('next town over (by km and by sibling)', () => {
    const r = nearMissOf({ locationIds: [10] }, { price: 1, priceTo: null, locationId: 12 }, ctx, T);
    expect(r).toMatchObject({ code: 'nearby', place: 'Benahavís' });
    expect(nearMissOf({ locationIds: [10] }, { price: 1, priceTo: null, locationId: 14 }, ctx, T)).toEqual({ code: 'nearby', place: 'Istán', km: null });
  });

  it('a far town is not a near miss', () => {
    expect(nearMissOf({ locationIds: [10] }, { price: 1, priceTo: null, locationId: 13 }, ctx, T)).toBeNull();
  });

  it('two misses at once are not a near miss', () => {
    expect(nearMissOf({ locationIds: [10], budgetMax: 400000 }, { price: 410000, priceTo: null, locationId: 12 }, ctx, T)).toBeNull();
  });

  it('a full match is not a near miss', () => {
    expect(nearMissOf({ locationIds: [10], budgetMax: 400000 }, { price: 390000, priceTo: null, locationId: 11 }, ctx, T)).toBeNull();
  });

  it('a threshold of 0 turns budget misses off', () => {
    expect(nearMissOf({ budgetMax: 400000 }, { price: 401000, priceTo: null, locationId: 10 }, ctx, { ...T, budgetPercent: 0 })).toBeNull();
  });

  it('an unpriced listing is never a budget near miss', () => {
    expect(nearMissOf({ budgetMax: 400000 }, { price: 0, priceTo: null, locationId: 10, priceOnRequest: false }, ctx, T)).toBeNull();
    expect(nearMissOf({ budgetMax: 400000 }, { price: 410000, priceTo: null, locationId: 10, priceOnRequest: true }, ctx, T)).toBeNull();
  });
});

describe('wishReasons', () => {
  it('says how many bedrooms short, and which features are missing', () => {
    expect(
      wishReasons(['bedrooms', 'bathrooms', 'buildSize', 'feature:7'], { minBedrooms: 3, minBathrooms: 2 }, { bedrooms: 2, bedroomsTo: null, bathrooms: null, bathroomsTo: null }),
    ).toEqual([
      { code: 'bedrooms_short', n: 1 },
      { code: 'bathrooms_short', n: null },
      { code: 'build_size' },
      { code: 'feature', id: 7 },
    ]);
  });

  it('uses the top of a range', () => {
    expect(wishReasons(['bedrooms'], { minBedrooms: 4 }, { bedrooms: 1, bedroomsTo: 3 })).toEqual([{ code: 'bedrooms_short', n: 1 }]);
  });
});
