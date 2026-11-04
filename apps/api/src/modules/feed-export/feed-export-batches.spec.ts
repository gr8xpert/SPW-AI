import type { Property } from '../../database/entities';
import { FeedExportService } from './feed-export.service';
import { ExportProperty, joinJsonFeedRows, jsonFeedRow } from './export-rows';
import { KYERO_CHECK_COLUMNS, KyeroFeedWriter, KyeroLocationRow, buildKyeroFeed, kyeroSkipReason } from './kyero/kyero-builder';

const locations = new Map<number, KyeroLocationRow>([
  [10, { id: 10, parentId: null, level: 'province', name: { en: 'Málaga' } }],
  [11, { id: 11, parentId: 10, level: 'town', name: { en: 'Fuengirola' } }],
  [13, { id: 13, parentId: null, level: 'town', name: { en: 'Nowhere' } }],
]);
const lookups = {
  locations,
  types: new Map([[1, { name: { en: 'Villa' } }]]),
  features: new Map<number, { name: Record<string, string> }>(),
};

const listing = (id: number, over: Partial<Property> = {}) =>
  ({
    id,
    reference: `R${id}`,
    listingType: 'sale',
    price: 345000,
    currency: 'EUR',
    propertyTypeId: 1,
    locationId: 11,
    features: [],
    images: [],
    description: { en: 'Sea "views"\nand sun' },
    updatedAt: new Date('2026-09-05T17:13:58Z'),
    ...over,
  }) as Property;

const mixed = [
  listing(1),
  listing(2, { price: null }),
  listing(3, { listingType: 'rent', rentalPeriod: 'night' }),
  listing(4, { propertyTypeId: null }),
  listing(5, { locationId: null }),
  listing(6, { locationId: 13 }),
  listing(7),
];

describe('Kyero feed written in batches', () => {
  it('gives the same feed as all listings at once', () => {
    const whole = buildKyeroFeed({ properties: mixed, ...lookups });
    const writer = new KyeroFeedWriter(lookups);
    writer.add(mixed.slice(0, 3));
    writer.add(mixed.slice(3));
    expect(writer.finish()).toEqual(whole);
    expect(whole.included).toBe(2);
    expect(whole.skipped).toHaveLength(5);
  });

  it('an empty feed is still a whole document', () => {
    expect(new KyeroFeedWriter(lookups).finish().xml).toBe(buildKyeroFeed({ properties: [], ...lookups }).xml);
    expect(new KyeroFeedWriter(lookups).finish().xml).toMatch(/<\/kyero>\n<\/root>$/);
  });
});

describe('kyeroSkipReason', () => {
  it('gives the reason the feed gives, reading only the check columns', () => {
    const { skipped } = buildKyeroFeed({ properties: mixed, ...lookups });
    const onlyChecked = (p: Property) =>
      Object.fromEntries(KYERO_CHECK_COLUMNS.map((c) => [c, p[c]])) as Pick<Property, (typeof KYERO_CHECK_COLUMNS)[number]>;
    const reasons = mixed
      .map((p) => ({ reference: p.reference, reason: kyeroSkipReason(onlyChecked(p), lookups) }))
      .filter((r) => r.reason);
    expect(reasons).toEqual(skipped);
  });
});

describe('JSON feed rows', () => {
  const row = (id: string) => ({ id, descriptions: { en: 'Line one\nline "two"' }, images: ['a', 'b'], features: [] }) as unknown as ExportProperty;

  it('reads the same as stringifying the whole list', () => {
    const rows = [row('1'), row('2')];
    expect(joinJsonFeedRows(rows.map(jsonFeedRow))).toBe(JSON.stringify(rows, null, 2));
  });

  it('an empty feed is an empty list', () => {
    expect(joinJsonFeedRows([])).toBe(JSON.stringify([], null, 2));
  });
});

describe('FeedExportService batching', () => {
  function serviceWithRows(ids: number[], configRepo: unknown = {}) {
    const afterIds: number[] = [];
    const query: any = {
      clone: () => query,
      andWhere: (_: string, params: { afterId: number }) => {
        afterIds.push(params.afterId);
        return query;
      },
      orderBy: () => query,
      take: (n: number) => {
        query.size = n;
        return query;
      },
      getMany: async () =>
        ids.filter((id) => id > afterIds[afterIds.length - 1]).slice(0, query.size).map((id) => listing(id)),
    };
    const service = new (FeedExportService as any)(configRepo, {}, {}, {}, {}, {}, {}, {}, {}, {}, {});
    return { service, query, afterIds };
  }

  it('reads every listing once, picking up after the last id', async () => {
    const { service, query, afterIds } = serviceWithRows([3, 5, 8, 9, 20]);
    const seen: number[][] = [];
    for await (const batch of service.batches(query, 2)) seen.push(batch.map((p: Property) => p.id));
    expect(seen).toEqual([[3, 5], [8, 9], [20]]);
    expect(afterIds).toEqual([0, 5, 9]);
  });

  it('stops on an empty batch when the list ends on a full one', async () => {
    const { service, query } = serviceWithRows([1, 2]);
    const seen: number[][] = [];
    for await (const batch of service.batches(query, 2)) seen.push(batch.map((p: Property) => p.id));
    expect(seen).toEqual([[1, 2]]);
  });

  it('runs feed builds one at a time, and a failed one does not block the next', async () => {
    const { service } = serviceWithRows([]);
    const order: string[] = [];
    let finishFirst!: () => void;
    const first = service.oneBuildAtATime(async () => {
      order.push('first starts');
      await new Promise<void>((resolve) => (finishFirst = resolve));
      order.push('first ends');
      throw new Error('boom');
    });
    const second = service.oneBuildAtATime(async () => {
      order.push('second');
      return 'done';
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(order).toEqual(['first starts']);
    finishFirst();
    await expect(first).rejects.toThrow('boom');
    await expect(second).resolves.toBe('done');
    expect(order).toEqual(['first starts', 'first ends', 'second']);
  });
});
