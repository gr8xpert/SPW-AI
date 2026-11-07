import { FeedService } from './feed.service';
import { computeFeedHash } from './feed-hash';

// markAsArchived: a feed of archived listings (Odoo's archive as a Kyero feed)
// archives and unpublishes what it imports. Archived wins over any other feed,
// and a listing a user took out of the archive by hand stays out.

const FEED_ID = 9;
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
    delete: jest.fn(),
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => x),
  };
  svc.findOrCreateLocation = jest.fn().mockResolvedValue(1);
  svc.findPropertyTypeId = jest.fn().mockResolvedValue(1);
  svc.findFeatureIds = jest.fn().mockResolvedValue([1]);
  svc.processImages = jest.fn().mockResolvedValue([]);
  return svc;
}

function existingRow(fp: any, overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    tenantId: TENANT_ID,
    externalId: fp.externalId,
    syncEnabled: true,
    contentHash: computeFeedHash(fp),
    images: [{ url: 'https://cdn/a.jpg', sourceUrl: 'https://cdn/a.jpg' }],
    status: 'active',
    isPublished: true,
    publishedAt: new Date(),
    isArchived: false,
    unarchivedByHand: false,
    propertyTypeId: 1,
    features: [1],
    locationId: 1,
    feedConfigId: FEED_ID,
    lockedFields: null,
    isFeatured: false,
    featuredByFeedId: null,
    feedLocation: { provider: 'kyero', province: 'Málaga', town: 'Marbella' },
    feedType: { provider: 'kyero', name: 'Villa' },
    ...overrides,
  };
}

const importOne = (svc: any, fp: any, markAsArchived: boolean, feedId = FEED_ID) =>
  svc.importProperty(TENANT_ID, feedId, 'kyero', fp, null, [], {}, false, undefined, null, null, markAsArchived);

describe('importing from a markAsArchived feed', () => {
  it('creates new listings archived and unpublished', async () => {
    const svc = makeService();
    svc.propertyRepository.findOne.mockResolvedValue(null);

    await expect(importOne(svc, feedProperty('A1'), true)).resolves.toBe('created');
    expect(svc.propertyRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ isArchived: true, isPublished: false, publishedAt: null }),
    );
  });

  it('archives a published listing it also lists (archived wins)', async () => {
    const svc = makeService();
    const fp = feedProperty('A2');
    svc.propertyRepository.findOne.mockResolvedValue(existingRow(fp));

    await expect(importOne(svc, fp, true)).resolves.toBe('updated');
    expect(svc.propertyRepository.update).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ isArchived: true, isPublished: false }),
    );
  });

  it('leaves a listing a user took out of the archive by hand', async () => {
    const svc = makeService();
    const fp = feedProperty('A3');
    svc.propertyRepository.findOne.mockResolvedValue(existingRow(fp, { unarchivedByHand: true }));

    await expect(importOne(svc, fp, true)).resolves.toBe('skipped');
  });

  it('an ordinary feed never publishes an archived listing', async () => {
    const svc = makeService();
    const fp = feedProperty('A4');
    svc.propertyRepository.findOne.mockResolvedValue(
      existingRow(fp, { isArchived: true, isPublished: false, publishedAt: null, feedConfigId: 3 }),
    );

    await expect(importOne(svc, fp, false, 3)).resolves.toBe('skipped');
    expect(svc.propertyRepository.update).not.toHaveBeenCalled();
  });

  it('an ordinary feed still creates new listings published', async () => {
    const svc = makeService();
    svc.propertyRepository.findOne.mockResolvedValue(null);

    await importOne(svc, feedProperty('A5'), false, 3);
    expect(svc.propertyRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ isArchived: false, isPublished: true }),
    );
  });
});

describe('removing listings that left a feed', () => {
  it('keeps archived listings', async () => {
    const svc = makeService();
    svc.releasePropertyImages = jest.fn();
    svc.propertyRepository.find.mockResolvedValue([
      { id: 1, externalId: 'gone-archived', syncEnabled: true, isArchived: true, images: [] },
      { id: 2, externalId: 'gone', syncEnabled: true, isArchived: false, images: [] },
      { id: 3, externalId: 'here', syncEnabled: true, isArchived: false, images: [] },
      ...Array.from({ length: 10 }, (_, i) => ({ id: 10 + i, externalId: `k${i}`, syncEnabled: true, isArchived: false, images: [] })),
    ]);
    const seen = new Set(['here', ...Array.from({ length: 10 }, (_, i) => `k${i}`)]);

    const res = await svc.removeListingsNoLongerInFeed({ id: 3, tenantId: TENANT_ID, provider: 'kyero' }, seen, seen.size);
    expect(res.removed).toBe(1);
    const [where] = svc.propertyRepository.delete.mock.calls[0];
    expect(where.id.value).toEqual([2]);
  });
});
