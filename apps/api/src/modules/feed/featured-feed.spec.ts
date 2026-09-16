import { FeedService } from './feed.service';

// markAsFeatured: a feed that IS the agency's featured list flags what it
// imports and unflags listings that leave it — without trampling featured
// flags a user set or cleared by hand. Exercised against a bare FeedService
// with in-memory repositories, like area-province-override.spec.

const FEED_ID = 7;
const TENANT_ID = 1;

function feedProperty(externalId: string) {
  return {
    externalId,
    reference: `R-${externalId}`,
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

function makeService() {
  const svc = Object.create(FeedService.prototype) as any;
  svc.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.propertyRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 0 }),
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => x),
  };
  svc.findOrCreateLocation = jest.fn().mockResolvedValue(1);
  svc.findPropertyTypeId = jest.fn().mockResolvedValue(1);
  svc.findFeatureIds = jest.fn().mockResolvedValue([1]);
  svc.processImages = jest.fn().mockResolvedValue([]);
  return svc;
}

// An existing row that is fully in sync with the feed, so the only reason the
// importer could touch it is the featured flag.
function existingRow(svc: any, fp: any, overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    tenantId: TENANT_ID,
    externalId: fp.externalId,
    syncEnabled: true,
    contentHash: svc.computeFeedHash(fp),
    images: [{ url: 'https://cdn/a.jpg', sourceUrl: 'https://cdn/a.jpg' }],
    status: 'active',
    isPublished: true,
    publishedAt: new Date(),
    propertyTypeId: 1,
    features: [1],
    locationId: 1,
    feedConfigId: FEED_ID,
    lockedFields: null,
    isFeatured: false,
    featuredByFeedId: null,
    ...overrides,
  };
}

const importOne = (svc: any, fp: any, markAsFeatured: boolean, protectedFields: string[] = []) =>
  svc.importProperty(TENANT_ID, FEED_ID, 'resales', fp, null, protectedFields, {}, markAsFeatured);

describe('importing from a markAsFeatured feed', () => {
  // The reported bug: 40 listings imported by "Featured Properties", zero
  // showing under the Featured filter. Already-imported, unchanged listings
  // must be flagged on the next sync, not only brand-new ones.
  it('flags an unchanged, already-imported listing', async () => {
    const svc = makeService();
    const fp = feedProperty('X1');
    svc.propertyRepository.findOne.mockResolvedValue(existingRow(svc, fp));

    await expect(importOne(svc, fp, true)).resolves.toBe('updated');
    expect(svc.propertyRepository.update).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ isFeatured: true, featuredByFeedId: FEED_ID }),
    );
  });

  it('flags a new listing on create', async () => {
    const svc = makeService();
    svc.propertyRepository.findOne.mockResolvedValue(null);

    await expect(importOne(svc, feedProperty('X2'), true)).resolves.toBe('created');
    expect(svc.propertyRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ isFeatured: true, featuredByFeedId: FEED_ID }),
    );
  });

  it('leaves listings from an ordinary feed alone', async () => {
    const svc = makeService();
    const fp = feedProperty('X3');
    svc.propertyRepository.findOne.mockResolvedValue(existingRow(svc, fp));

    await expect(importOne(svc, fp, false)).resolves.toBe('skipped');
    expect(svc.propertyRepository.update).not.toHaveBeenCalled();

    svc.propertyRepository.findOne.mockResolvedValue(null);
    await importOne(svc, feedProperty('X4'), false);
    expect(svc.propertyRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ isFeatured: false, featuredByFeedId: null }),
    );
  });

  it('does not re-feature a listing a user unfeatured by hand', async () => {
    const svc = makeService();
    const fp = feedProperty('X5');
    svc.propertyRepository.findOne.mockResolvedValue(
      existingRow(svc, fp, { isFeatured: false, featuredByFeedId: FEED_ID }),
    );

    await expect(importOne(svc, fp, true)).resolves.toBe('skipped');
  });

  it('does not take ownership of a listing featured by hand', async () => {
    const svc = makeService();
    const fp = feedProperty('X6');
    svc.propertyRepository.findOne.mockResolvedValue(
      existingRow(svc, fp, { isFeatured: true, featuredByFeedId: null }),
    );

    await expect(importOne(svc, fp, true)).resolves.toBe('skipped');
  });

  it('respects isFeatured as a locked or protected field', async () => {
    const svc = makeService();
    const fp = feedProperty('X7');
    svc.propertyRepository.findOne.mockResolvedValue(
      existingRow(svc, fp, { lockedFields: ['isFeatured'] }),
    );
    await expect(importOne(svc, fp, true)).resolves.toBe('skipped');

    svc.propertyRepository.findOne.mockResolvedValue(existingRow(svc, fp));
    await expect(importOne(svc, fp, true, ['isFeatured'])).resolves.toBe('skipped');
  });
});

describe('unfeaturing listings that left the feed', () => {
  function processImportHarness(pages: Array<{ properties: any[]; hasMore: boolean } | Error>) {
    const svc = makeService();
    const config = {
      id: FEED_ID,
      tenantId: TENANT_ID,
      provider: 'resales',
      credentials: {},
      markAsFeatured: true,
      protectedFields: [],
    };
    const importLog = { id: 1 };
    svc.feedConfigRepository = { findOne: jest.fn().mockResolvedValue(config), save: jest.fn() };
    svc.importLogRepository = { findOne: jest.fn().mockResolvedValue(importLog), save: jest.fn() };
    svc.tenantRepository = { findOne: jest.fn().mockResolvedValue({ id: TENANT_ID, settings: {} }) };
    svc.tenantService = { clearCache: jest.fn() };
    svc.aiEnrichmentService = { enrichAll: jest.fn().mockRejectedValue(new Error('skip')) };
    const fetchProperties = jest.fn();
    for (const page of pages) {
      if (page instanceof Error) fetchProperties.mockRejectedValueOnce(page);
      else fetchProperties.mockResolvedValueOnce(page);
    }
    svc.getAdapter = () => ({ fetchProperties });
    svc.importProperty = jest.fn().mockResolvedValue('skipped');
    // Listings this feed flagged on earlier runs.
    svc.propertyRepository.find.mockResolvedValue([
      { id: 1, externalId: 'STAYS' },
      { id: 2, externalId: 'LEFT' },
    ]);
    svc.propertyRepository.update.mockResolvedValue({ affected: 1 });
    return { svc, importLog };
  }

  it('releases only the listings missing from a complete run', async () => {
    const { svc } = processImportHarness([
      { properties: [feedProperty('STAYS'), feedProperty('NEW')], hasMore: false },
    ]);

    await svc.processImport(FEED_ID, 1);

    expect(svc.propertyRepository.update).toHaveBeenCalledTimes(1);
    const [where, patch] = svc.propertyRepository.update.mock.calls[0];
    expect(where).toMatchObject({ tenantId: TENANT_ID, featuredByFeedId: FEED_ID });
    expect(where.id.value).toEqual([2]);
    expect(patch).toEqual({ isFeatured: false, featuredByFeedId: null });
  });

  // A run that dies on page 2 never saw the listings on the pages after it —
  // unfeaturing those would empty the client's featured section.
  it('releases nothing when the run fails part way', async () => {
    const { svc } = processImportHarness([
      { properties: [feedProperty('STAYS')], hasMore: true },
      new Error('Resales API timeout'),
    ]);

    await svc.processImport(FEED_ID, 1);

    expect(svc.propertyRepository.update).not.toHaveBeenCalled();
  });

  it('releases nothing when the feed comes back empty', async () => {
    const { svc } = processImportHarness([{ properties: [], hasMore: false }]);

    await svc.processImport(FEED_ID, 1);

    expect(svc.propertyRepository.update).not.toHaveBeenCalled();
  });
});
