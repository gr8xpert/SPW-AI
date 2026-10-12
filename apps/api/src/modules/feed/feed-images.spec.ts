import { FeedService } from './feed.service';

// processImages() with the tenant's "feed images to R2" switch off: the
// provider URLs are kept. A storage config that can't be read (e.g. keys
// encrypted under another ENCRYPTION_KEY) must not fail the listing — it only
// means orphaned blobs can't be released this run.
const makeService = (storageError?: Error) => {
  const svc = Object.create(FeedService.prototype) as any;
  svc.logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
  svc.tenantRepository = { findOne: jest.fn().mockResolvedValue({ id: 1, feedImagesToR2: false }) };
  svc.uploadService = {
    getStorageConfig: storageError ? jest.fn().mockRejectedValue(storageError) : jest.fn().mockResolvedValue(null),
    releaseBlob: jest.fn().mockResolvedValue(undefined),
    downloadAndStoreFeedImage: jest.fn(),
  };
  return svc;
};

const feedImages = [
  { url: 'https://cdn.example.com/a.jpg', order: 0 },
  { url: 'https://cdn.example.com/b.jpg', order: 1, alt: 'Floor plan' },
];

describe('feed images', () => {
  it('keeps the provider URLs when images are not sent to R2', async () => {
    const svc = makeService();
    const out = await svc.processImages(1, 'R1', feedImages, null);
    expect(out).toEqual([
      { url: 'https://cdn.example.com/a.jpg', sourceUrl: 'https://cdn.example.com/a.jpg', order: 0, alt: undefined },
      { url: 'https://cdn.example.com/b.jpg', sourceUrl: 'https://cdn.example.com/b.jpg', order: 1, alt: 'Floor plan' },
    ]);
  });

  it('still returns the images when the storage config cannot be read', async () => {
    const svc = makeService(new Error('Unsupported state or unable to authenticate data'));
    const out = await svc.processImages(1, 'R1', feedImages, null);
    expect(out.map((i: { url: string }) => i.url)).toEqual(['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg']);
    expect(svc.logger.warn).toHaveBeenCalledWith(expect.stringContaining('storage config'));
    expect(svc.uploadService.releaseBlob).not.toHaveBeenCalled();
  });
});
