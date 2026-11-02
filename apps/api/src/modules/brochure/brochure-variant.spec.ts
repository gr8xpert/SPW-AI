import { BrochureService } from './brochure.service';

jest.mock('./puppeteer-pool.service', () => ({ PuppeteerPoolService: class {} }));

// Which PDF look a brochure gets: URL override, then the property's own choice,
// then the website key's choice for its listing type, then the client's default.
const resolve = (
  property: { brochureVariant?: string; listingType: string },
  defaultVariant: string | undefined,
  override?: string,
  keyVariants?: Record<string, string>,
): string =>
  (BrochureService.prototype as any).resolveVariant(property, { settings: { defaultBrochureVariant: defaultVariant } }, override, keyVariants);

describe('brochure variant order', () => {
  const tabs = { sale: 'branded', development: 'unbranded' };

  it('uses the key\'s choice for the listing type', () => {
    expect(resolve({ brochureVariant: 'inherit', listingType: 'sale' }, 'unbranded', undefined, tabs)).toBe('branded');
    expect(resolve({ brochureVariant: 'inherit', listingType: 'development' }, 'branded', undefined, tabs)).toBe('unbranded');
  });

  it('lets a property\'s own choice beat the key', () => {
    expect(resolve({ brochureVariant: 'branded', listingType: 'development' }, 'unbranded', undefined, tabs)).toBe('branded');
    expect(resolve({ brochureVariant: 'unbranded', listingType: 'sale' }, 'branded', undefined, tabs)).toBe('unbranded');
  });

  it('falls back to the client default when the tab has no choice or there is no website key', () => {
    expect(resolve({ brochureVariant: 'inherit', listingType: 'rent' }, 'unbranded', undefined, tabs)).toBe('unbranded');
    expect(resolve({ brochureVariant: 'inherit', listingType: 'sale' }, 'unbranded')).toBe('unbranded');
    expect(resolve({ brochureVariant: 'inherit', listingType: 'sale' }, undefined)).toBe('branded');
  });

  it('keeps the URL override first', () => {
    expect(resolve({ brochureVariant: 'unbranded', listingType: 'sale' }, 'unbranded', 'branded', tabs)).toBe('branded');
  });
});
