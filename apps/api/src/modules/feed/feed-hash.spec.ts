import { computeFeedHash } from './feed-hash';
import { FeedProperty } from './adapters';

const base = (): FeedProperty => ({
  externalId: '1',
  reference: 'R1',
  title: { en: 'Villa in Moraira' },
  description: { en: 'First', es: 'Primero' },
  listingType: 'sale',
  propertyType: 'villa',
  price: 100,
  currency: 'EUR',
  images: [{ url: 'https://x/1.jpg', order: 0 }],
  features: ['Pool'],
  location: { name: 'Moraira', town: 'Moraira', province: 'Alicante' },
});

describe('computeFeedHash', () => {
  it('changes when a description, title or location text changes', () => {
    const h = computeFeedHash(base());
    expect(computeFeedHash({ ...base(), description: { en: 'First', es: 'Cambiado' } })).not.toBe(h);
    expect(computeFeedHash({ ...base(), title: { en: 'Plot in Moraira' } })).not.toBe(h);
    expect(computeFeedHash({ ...base(), location: { name: 'Benissa', town: 'Benissa', province: 'Alicante' } })).not.toBe(h);
  });

  it('ignores images and key order', () => {
    const h = computeFeedHash(base());
    expect(computeFeedHash({ ...base(), images: [] })).toBe(h);
    const reordered = { ...base(), description: { es: 'Primero', en: 'First' } };
    expect(computeFeedHash(reordered)).toBe(h);
  });
});
