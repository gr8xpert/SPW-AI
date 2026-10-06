import { applySiteMinPrices, siteListingTypes, siteMinPrices } from './site-limits';

describe('site limits', () => {
  it('reads only positive floors for known listing types', () => {
    expect(siteMinPrices({ minPrices: { sale: 200000, development: '200000', rent: 500, holiday_rent: null, villa: 9 } })).toEqual({
      sale: 200000,
      development: 200000,
      rent: 500,
    });
    expect(siteMinPrices({ minPrices: { sale: 0, rent: -1 } })).toBeNull();
    expect(siteMinPrices({ minPrices: [200000] })).toBeNull();
    expect(siteMinPrices(null)).toBeNull();
  });

  it('adds one condition per floor, keeping unpriced listings', () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const qb = { andWhere: (sql: string, params: Record<string, unknown>) => { calls.push([sql, params]); return qb; } };
    applySiteMinPrices(qb as never, { sale: 200000, holiday_rent: 200 });
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toContain('NOT (p.listingType = :floorType_sale');
    expect(calls[0][0]).toContain('p.priceOnRequest = 0 AND COALESCE(p.price, 0) > 0');
    expect(calls[0][1]).toEqual({ floorType_sale: 'sale', floorMin_sale: 200000 });
    expect(calls[1][1]).toEqual({ floorType_holiday_rent: 'holiday_rent', floorMin_holiday_rent: 200 });
    applySiteMinPrices(qb as never, null);
    expect(calls).toHaveLength(2);
  });

  it('keeps the listing-type rule unchanged', () => {
    expect(siteListingTypes({ enabledListingTypes: ['sale', 'development'] })).toEqual(['sale', 'development']);
    expect(siteListingTypes({ enabledListingTypes: ['sale', 'rent', 'holiday_rent', 'development'] })).toBeNull();
  });
});
