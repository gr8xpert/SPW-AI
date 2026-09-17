import { FeedService } from './feed.service';

// removeMissing: after a complete sync, properties this feed owns that the
// feed no longer returns (sold, withdrawn) are deleted so the site mirrors the
// source. Exercised against a bare FeedService with in-memory repositories,
// like featured-feed.spec.

const TENANT_ID = 1;
const SALES_FEED = 7;
const FEATURED_FEED = 8;

function feedProperty(externalId: string) {
  return {
    externalId,
    reference: externalId,
    listingType: 'sale',
    propertyType: 'Villa',
    title: { en: 'Villa' },
    description: { en: 'Nice' },
    price: 100000,
    currency: 'EUR',
    features: ['Pool'],
    featureCategories: {},
    location: { province: 'Málaga', town: 'Marbella' },
    images: [{ url: 'https://cdn/a.jpg' }],
  } as any;
}

type Row = { id: number; externalId: string; syncEnabled?: boolean; feedConfigId?: number; images?: any[] };

function harness(opts: {
  pages: Array<{ properties: any[]; totalCount?: number; hasMore: boolean } | Error>;
  owned: Row[];
  config?: Record<string, unknown>;
}) {
  const svc = Object.create(FeedService.prototype) as any;
  svc.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const config = {
    id: SALES_FEED,
    tenantId: TENANT_ID,
    provider: 'resales',
    credentials: {},
    markAsFeatured: false,
    protectedFields: [],
    ...opts.config,
  };
  const importLog: any = { id: 1 };
  svc.feedConfigRepository = {
    findOne: jest.fn().mockResolvedValue(config),
    find: jest.fn().mockResolvedValue([config]),
    save: jest.fn(),
  };
  svc.importLogRepository = { findOne: jest.fn().mockResolvedValue(importLog), save: jest.fn() };
  svc.tenantRepository = { findOne: jest.fn().mockResolvedValue({ id: TENANT_ID, settings: {} }) };
  svc.tenantService = { clearCache: jest.fn() };
  svc.aiEnrichmentService = { enrichAll: jest.fn().mockRejectedValue(new Error('skip')) };
  svc.uploadService = { getStorageConfig: jest.fn(), releaseBlob: jest.fn() };
  const fetchProperties = jest.fn();
  for (const page of opts.pages) {
    if (page instanceof Error) fetchProperties.mockRejectedValueOnce(page);
    else fetchProperties.mockResolvedValueOnce({ totalCount: page.properties.length, ...page });
  }
  svc.getAdapter = () => ({ fetchProperties });
  svc.importProperty = jest.fn().mockResolvedValue('skipped');
  svc.propertyRepository = {
    find: jest.fn().mockResolvedValue(opts.owned),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    update: jest.fn().mockResolvedValue({ affected: 0 }),
  };
  const deletedIds = () =>
    svc.propertyRepository.delete.mock.calls.flatMap(([where]: any[]) => where.id.value as number[]);
  return { svc, importLog, deletedIds };
}

const rows = (n: number, prefix = 'R'): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, externalId: `${prefix}${i + 1}`, syncEnabled: true }));
const props = (refs: string[]) => refs.map(feedProperty);

describe('removing listings that left the feed', () => {
  it('deletes owned listings the complete run did not return', async () => {
    const owned = rows(10);
    const { svc, importLog, deletedIds } = harness({
      pages: [{ properties: props(owned.slice(0, 8).map((r) => r.externalId)), hasMore: false }],
      owned,
    });

    await svc.processImport(SALES_FEED, 1);

    expect(deletedIds().sort((a: number, b: number) => a - b)).toEqual([9, 10]);
    expect(svc.propertyRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT_ID, feedConfigId: SALES_FEED, source: 'resales' } }),
    );
    expect(importLog.removedCount).toBe(2);
    expect(importLog.status).toBe('success');
    expect(svc.tenantService.clearCache).toHaveBeenCalled();
  });

  it('keeps a listing whose "Enable Feed Sync" is off', async () => {
    const owned = rows(10);
    owned[9].syncEnabled = false;
    const { svc, deletedIds } = harness({
      pages: [{ properties: props(owned.slice(0, 8).map((r) => r.externalId)), hasMore: false }],
      owned,
    });

    await svc.processImport(SALES_FEED, 1);

    expect(deletedIds()).toEqual([9]);
  });

  it('keeps everything when the feed option is off', async () => {
    const owned = rows(10);
    const { svc, importLog } = harness({
      pages: [{ properties: props(['R1']), hasMore: false }],
      owned,
      config: { removeMissing: false },
    });

    await svc.processImport(SALES_FEED, 1);

    expect(svc.propertyRepository.delete).not.toHaveBeenCalled();
    expect(importLog.removedCount).toBe(0);
  });

  it('removes nothing when the run fails part way', async () => {
    const owned = rows(10);
    const { svc } = harness({
      pages: [{ properties: props(['R1', 'R2']), hasMore: true }, new Error('Resales API timeout')],
      owned,
    });

    await svc.processImport(SALES_FEED, 1);

    expect(svc.propertyRepository.delete).not.toHaveBeenCalled();
  });

  it('removes nothing when the run received clearly fewer than the feed reported', async () => {
    const owned = rows(100);
    const { svc, importLog } = harness({
      pages: [
        { properties: props(owned.slice(0, 40).map((r) => r.externalId)), totalCount: 100, hasMore: true },
        { properties: props(owned.slice(40, 80).map((r) => r.externalId)), totalCount: 100, hasMore: false },
      ],
      owned,
    });

    await svc.processImport(SALES_FEED, 1);

    expect(svc.propertyRepository.delete).not.toHaveBeenCalled();
    expect(importLog.status).toBe('partial');
    expect(importLog.errors).toEqual([
      { ref: 'removal', error: expect.stringContaining('received 80 of 100') },
    ]);
  });

  it('removes nothing when the feed comes back empty', async () => {
    const { svc } = harness({ pages: [{ properties: [], hasMore: false }], owned: rows(10) });

    await svc.processImport(SALES_FEED, 1);

    expect(svc.propertyRepository.delete).not.toHaveBeenCalled();
  });

  it('refuses a mass removal (e.g. the filter was changed) and says why', async () => {
    const owned = rows(200);
    const { svc, importLog } = harness({
      pages: [{ properties: props(owned.slice(0, 100).map((r) => r.externalId)), hasMore: false }],
      owned,
    });

    await svc.processImport(SALES_FEED, 1);

    expect(svc.propertyRepository.delete).not.toHaveBeenCalled();
    expect(importLog.errors[0].error).toContain('100 of 200 properties would be removed at once');
  });

  it('allows a normal day of sales on a small feed', async () => {
    const owned = rows(30);
    const { svc, deletedIds } = harness({
      pages: [{ properties: props(owned.slice(0, 18).map((r) => r.externalId)), hasMore: false }],
      owned,
    });

    await svc.processImport(SALES_FEED, 1);

    // 12 of 30 is over 30% but not more than the 20-listing floor.
    expect(deletedIds()).toHaveLength(12);
  });
});

describe('which feed owns a listing (and so may remove it)', () => {
  function importHarness(existing: Record<string, unknown>) {
    const svc = Object.create(FeedService.prototype) as any;
    svc.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const fp = feedProperty('X1');
    svc.propertyRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 11,
        tenantId: TENANT_ID,
        externalId: 'X1',
        syncEnabled: true,
        contentHash: svc.computeFeedHash(fp),
        images: [{ url: 'https://cdn/a.jpg', sourceUrl: 'https://cdn/a.jpg' }],
        status: 'active',
        isPublished: true,
        publishedAt: new Date(),
        propertyTypeId: 1,
        features: [1],
        locationId: 1,
        lockedFields: null,
        isFeatured: true,
        featuredByFeedId: null,
        ...existing,
      }),
      update: jest.fn(),
    };
    const ownership = {
      liveFeedIds: new Set([SALES_FEED, FEATURED_FEED]),
      featuredFeedIds: new Set([FEATURED_FEED]),
    };
    const run = (feedId: number, markAsFeatured: boolean) =>
      svc.importProperty(TENANT_ID, feedId, 'resales', fp, null, [], {}, markAsFeatured, ownership);
    return { svc, run };
  }

  // Otherwise a listing that leaves the featured list but is still for sale
  // would be deleted by the featured feed.
  it('a featured feed does not take a listing owned by the sales feed', async () => {
    const { svc, run } = importHarness({ feedConfigId: SALES_FEED });
    await expect(run(FEATURED_FEED, true)).resolves.toBe('skipped');
    expect(svc.propertyRepository.update).not.toHaveBeenCalled();
  });

  it('the sales feed takes a listing the featured feed created', async () => {
    const { svc, run } = importHarness({ feedConfigId: FEATURED_FEED });
    await expect(run(SALES_FEED, false)).resolves.toBe('updated');
    expect(svc.propertyRepository.update).toHaveBeenCalledWith(11, expect.objectContaining({ feedConfigId: SALES_FEED }));
  });

  it('a feed takes an unowned listing or one of a deleted feed, even when nothing else changed', async () => {
    for (const owner of [null, 999]) {
      const { svc, run } = importHarness({ feedConfigId: owner });
      await expect(run(FEATURED_FEED, true)).resolves.toBe('updated');
      expect(svc.propertyRepository.update).toHaveBeenCalledWith(11, expect.objectContaining({ feedConfigId: FEATURED_FEED }));
    }
  });
});

describe('a featured feed next to a sales feed', () => {
  it('leaves removal to the sales feed', async () => {
    const owned = rows(10);
    const { svc } = harness({
      pages: [{ properties: props(['R1']), hasMore: false }],
      owned,
      config: { id: FEATURED_FEED, markAsFeatured: true },
    });
    svc.feedConfigRepository.find.mockResolvedValue([
      { id: FEATURED_FEED, provider: 'resales', markAsFeatured: true },
      { id: SALES_FEED, provider: 'resales', markAsFeatured: false },
    ]);

    await svc.processImport(FEATURED_FEED, 1);

    expect(svc.propertyRepository.delete).not.toHaveBeenCalled();
  });

  it('removes its own departed listings when it is the only feed of that source', async () => {
    const owned = rows(10);
    const { svc, deletedIds } = harness({
      pages: [{ properties: props(owned.slice(0, 9).map((r) => r.externalId)), hasMore: false }],
      owned,
      config: { id: FEATURED_FEED, markAsFeatured: true },
    });
    svc.feedConfigRepository.find.mockResolvedValue([
      { id: FEATURED_FEED, provider: 'resales', markAsFeatured: true },
      { id: 3, provider: 'kyero', markAsFeatured: false },
    ]);

    await svc.processImport(FEATURED_FEED, 1);

    expect(deletedIds()).toEqual([10]);
  });
});
