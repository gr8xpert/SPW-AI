import { lastValueFrom, of } from 'rxjs';
import { propertyUrlSegment, slugifyTitle } from './property-url';
import { PropertyUrlInterceptor } from './property-url.interceptor';

const villa = {
  reference: 'R5P-123',
  title: 'Luxury Villa in Málaga',
  location: { name: 'Nueva Andalucía' },
  propertyType: { name: 'Villa' },
};

describe('propertyUrlSegment', () => {
  it('title + reference by default (the format sites already use)', () => {
    expect(propertyUrlSegment(villa, undefined)).toBe('luxury-villa-in-malaga_R5P-123');
  });

  it('follows every slug format, reference always behind an underscore', () => {
    expect(propertyUrlSegment(villa, 'ref')).toBe('R5P-123');
    expect(propertyUrlSegment(villa, 'ref-title')).toBe('R5P-123_luxury-villa-in-malaga');
    expect(propertyUrlSegment(villa, 'title-ref')).toBe('luxury-villa-in-malaga_R5P-123');
    expect(propertyUrlSegment(villa, 'location-type-ref')).toBe('nueva-andalucia-villa_R5P-123');
    expect(propertyUrlSegment(villa, 'ref-type-location')).toBe('R5P-123_villa-nueva-andalucia');
  });

  it("a property's own slug replaces the words in any format", () => {
    expect(propertyUrlSegment({ ...villa, slug: 'Sea View Villa' }, 'title-ref')).toBe('sea-view-villa_R5P-123');
    expect(propertyUrlSegment({ ...villa, slug: 'sea-view-villa' }, 'ref')).toBe('sea-view-villa_R5P-123');
    expect(propertyUrlSegment({ ...villa, slug: 'sea-view-villa' }, 'ref-title')).toBe('R5P-123_sea-view-villa');
  });

  it('falls back to the reference when there are no words', () => {
    expect(propertyUrlSegment({ reference: 'X1', title: '' }, 'title-ref')).toBe('X1');
    expect(propertyUrlSegment({ reference: 'X1', title: 'Villa' }, 'location-type-ref')).toBe('X1');
  });

  it('slugs fold accents and special letters', () => {
    expect(slugifyTitle('Straße  in Øster — Ålesund!')).toBe('strasse-in-oster-alesund');
  });
});

describe('PropertyUrlInterceptor', () => {
  const run = async (body: unknown, format?: string) => {
    const ctx: any = { switchToHttp: () => ({ getRequest: () => ({ spwSlugFormat: format }) }) };
    return lastValueFrom(new PropertyUrlInterceptor().intercept(ctx, { handle: () => of(body) }));
  };

  it('adds urlSegment to search results, lists and single properties', async () => {
    const search: any = await run({ data: [{ ...villa }], meta: { total: 1 } }, 'ref-title');
    expect(search.data[0].urlSegment).toBe('R5P-123_luxury-villa-in-malaga');
    const list: any = await run([{ ...villa }]);
    expect(list[0].urlSegment).toBe('luxury-villa-in-malaga_R5P-123');
    const one: any = await run({ ...villa });
    expect(one.urlSegment).toBe('luxury-villa-in-malaga_R5P-123');
  });

  it('sends only the agent card, never the user accounts', async () => {
    const user = {
      id: 3, email: 'staff@agency.test', name: 'Ana', role: 'admin', permissions: {}, avatarUrl: 'https://x/a.jpg', lastLoginAt: 'x',
      showOnWebsite: true, isActive: true, title: 'Partner', phone: '+34 600 111 222', publicEmail: 'ana@agency.test',
    };
    const one: any = await run({ ...villa, agent: user, agentId: 3, salesAgent: user, salesAgentId: 3, lastUpdatedByUser: user, lastUpdatedById: 3 });
    expect(one.agent).toEqual({ name: 'Ana', title: 'Partner', phone: '+34 600 111 222', email: 'ana@agency.test', photo: 'https://x/a.jpg' });
    for (const k of ['salesAgent', 'salesAgentId', 'lastUpdatedByUser', 'lastUpdatedById', 'agentId']) expect(one).not.toHaveProperty(k);
  });

  it('hides an agent who is not on the website', async () => {
    const user = { id: 3, email: 'staff@agency.test', name: 'Ana', role: 'user', showOnWebsite: false };
    const one: any = await run({ ...villa, agent: user });
    expect(one.agent).toBeNull();
  });
});
