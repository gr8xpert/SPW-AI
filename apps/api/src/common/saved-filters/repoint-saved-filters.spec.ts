import { repointKeyScope, repointSavedFilters } from './repoint-saved-filters';

const removed = new Set([12]);

describe('repointKeyScope', () => {
  it('a website key limited to the merged type now names the target', () => {
    expect(repointKeyScope({ propertyTypeIds: [12, 5], priceMin: 100 }, 'propertyType', removed, 11)).toEqual({
      propertyTypeIds: [11, 5],
      priceMin: 100,
    });
  });

  it('a website key limited to the merged location now names the target', () => {
    expect(repointKeyScope({ locationIds: [12] }, 'location', removed, 11)).toEqual({ locationIds: [11] });
  });

  it('a location merge leaves a type with the same id alone', () => {
    expect(repointKeyScope({ propertyTypeIds: [12] }, 'location', removed, 11)).toBeNull();
    expect(repointKeyScope({ locationIds: [12] }, 'propertyType', removed, 11)).toBeNull();
  });

  it('does not list the target twice', () => {
    expect(repointKeyScope({ locationIds: [12, 11] }, 'location', removed, 11)).toEqual({ locationIds: [11] });
  });

  it('reaches the per-listing-type tabs', () => {
    const scope = { byListingType: { sale: { locationIds: [12] }, rent: { locationIds: [5] } } };
    expect(repointKeyScope(scope, 'location', removed, 11)).toEqual({
      byListingType: { sale: { locationIds: [11] }, rent: { locationIds: [5] } },
    });
  });

  it('leaves a key that never named it alone', () => {
    expect(repointKeyScope({ locationIds: [5] }, 'location', removed, 11)).toBeNull();
    expect(repointKeyScope(null, 'location', removed, 11)).toBeNull();
  });
});

describe('repointSavedFilters', () => {
  function fakeDb(tables: Record<string, any[]>) {
    const writes: Array<{ sql: string; params: any[] }> = [];
    return {
      writes,
      query: async (sql: string, params: any[] = []) => {
        if (sql.startsWith('UPDATE')) {
          writes.push({ sql, params });
          return {};
        }
        const table = Object.keys(tables).find((t) => sql.includes(`FROM ${t} `));
        return table ? tables[table] : [];
      },
    };
  }

  it('updates keys, exports, wishlists and groups after a location merge, as JSON text or parsed', async () => {
    const db = fakeDb({
      api_keys: [{ id: 1, scope: '{"locationIds":[12]}' }, { id: 2, scope: { locationIds: [5] } }],
      feed_export_configs: [{ id: 3, propertyFilter: { locations: [12], types: [12] } }],
      leads: [{ id: 4, wishlist: { locationIds: [12, 5], budgetMax: 9 } }],
      location_groups: [{ id: 6, locationIds: '[12,11]' }],
    });
    await repointSavedFilters(db, 1, 'location', [12], 11);

    expect(db.writes.map((w) => [w.sql.split(' ')[1], JSON.parse(w.params[0]), w.params[1]])).toEqual([
      ['api_keys', { locationIds: [11] }, 1],
      ['feed_export_configs', { locations: [11], types: [12] }, 3],
      ['leads', { locationIds: [11, 5], budgetMax: 9 }, 4],
      ['location_groups', [11], 6],
    ]);
  });

  it('a type merge leaves location groups alone', async () => {
    const db = fakeDb({ location_groups: [{ id: 6, locationIds: [12] }] });
    await repointSavedFilters(db, 1, 'propertyType', [12], 11);
    expect(db.writes).toEqual([]);
  });

  it('a broken JSON value is skipped, not fatal', async () => {
    const db = fakeDb({ api_keys: [{ id: 1, scope: '{oops' }] });
    await expect(repointSavedFilters(db, 1, 'location', [12], 11)).resolves.toBeUndefined();
    expect(db.writes).toEqual([]);
  });
});
