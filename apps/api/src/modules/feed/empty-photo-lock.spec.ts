import { FeedService } from './feed.service';

// Before the 10-03 fix a dashboard save emptied a listing's photos AND locked
// them, so every later sync left the gallery empty (Cristi Homes R5407168).
// A photo lock on a listing with no photos must not block the feed.

function feedProperty() {
  return {
    externalId: 'E1',
    reference: 'R5407168',
    listingType: 'sale',
    propertyType: 'Apartment',
    title: { en: 'Flat' },
    description: { en: 'Nice' },
    price: 399950,
    currency: 'EUR',
    features: [],
    featureCategories: {},
    location: { province: 'Málaga', town: 'Benalmádena' },
    images: [{ url: 'https://cdn/1.jpg', order: 1 }, { url: 'https://cdn/2.jpg', order: 2 }],
  } as any;
}

function makeService() {
  const svc = Object.create(FeedService.prototype) as any;
  svc.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.propertyRepository = { findOne: jest.fn(), update: jest.fn().mockResolvedValue({ affected: 1 }) };
  svc.findOrCreateLocation = jest.fn().mockResolvedValue(1);
  svc.findPropertyTypeId = jest.fn().mockResolvedValue(1);
  svc.findFeatureIds = jest.fn().mockResolvedValue([]);
  svc.processImages = jest.fn(async (_t: number, _r: string, imgs: any[]) => imgs.map((i) => ({ url: i.url, sourceUrl: i.url, order: i.order })));
  return svc;
}

function existingRow(svc: any, fp: any, overrides: Record<string, unknown>) {
  return {
    id: 12160, tenantId: 6, externalId: fp.externalId, syncEnabled: true,
    contentHash: svc.computeFeedHash(fp), status: 'active', isPublished: true, publishedAt: new Date(),
    propertyTypeId: 1, features: [], locationId: 1, feedConfigId: 10, isFeatured: false, featuredByFeedId: null,
    feedLocation: { provider: 'resales', province: 'Málaga', town: 'Benalmádena' },
    feedType: { provider: 'resales', name: 'Apartment' },
    ...overrides,
  };
}

const importOne = (svc: any, fp: any, protectedFields: string[] = []) =>
  svc.importProperty(6, 10, 'resales', fp, null, protectedFields, {}, false);

describe('photo lock on a listing with no photos', () => {
  it('brings the feed photos back and drops only the photo lock', async () => {
    const svc = makeService();
    const fp = feedProperty();
    svc.propertyRepository.findOne.mockResolvedValue(
      existingRow(svc, fp, { images: null, lockedFields: ['price', 'images'] }),
    );

    await expect(importOne(svc, fp)).resolves.toBe('updated');
    const [, data] = svc.propertyRepository.update.mock.calls[0];
    expect(data.images).toHaveLength(2);
    expect(data.lockedFields).toEqual(['price']);
  });

  it('keeps a photo lock when the listing has photos', async () => {
    const svc = makeService();
    const fp = feedProperty();
    svc.propertyRepository.findOne.mockResolvedValue(
      existingRow(svc, fp, { images: [{ url: 'https://mine/x.jpg', order: 1 }], lockedFields: ['images'] }),
    );

    await importOne(svc, fp);
    const data = svc.propertyRepository.update.mock.calls[0]?.[1] ?? {};
    expect(data.images).toBeUndefined();
    expect(data.lockedFields).toBeUndefined();
  });

  it('honours photos protected on the feed', async () => {
    const svc = makeService();
    const fp = feedProperty();
    svc.propertyRepository.findOne.mockResolvedValue(existingRow(svc, fp, { images: [], lockedFields: ['images'] }));

    await importOne(svc, fp, ['images']);
    const data = svc.propertyRepository.update.mock.calls[0]?.[1] ?? {};
    expect(data.images).toBeUndefined();
  });
});
