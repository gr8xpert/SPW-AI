import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { AiSearchService } from './ai-search.service';

// What the AI returns is untrusted text from a model that is allowed to be
// wrong: it fences its JSON, invents ids that belong to no client, sends
// prices as strings and gets ranges backwards. None of that may reach a
// search. And because every call spends the CLIENT's OpenRouter credit, the
// gates in front of it matter as much as the parsing.

const LOCATIONS = [{ id: 11, name: 'Marbella' }, { id: 12, name: 'Estepona' }];
const TYPES = [{ id: 21, name: 'Villa' }, { id: 22, name: 'Apartment' }];
const FEATURES = [{ id: 31, name: 'Pool' }, { id: 32, name: 'Sea view' }];

function build(reply: string, opts: { key?: string | null; enabled?: boolean; usedToday?: number; limit?: number } = {}) {
  const chatCompletion = jest.fn().mockResolvedValue(reply);
  const settings: Record<string, unknown> = {};
  if (opts.limit !== undefined) settings.aiSearchDailyLimit = opts.limit;

  const tenants = {
    findOne: jest.fn().mockResolvedValue({
      id: 1,
      settings,
      openrouterApiKey: opts.key === undefined ? 'sk-or-client-key' : opts.key,
    }),
  };
  const usage = {
    findOne: jest.fn().mockResolvedValue(opts.usedToday ? { tenantId: 1, day: 'x', count: opts.usedToday } : null),
    query: jest.fn().mockResolvedValue(undefined),
  };
  const svc = new AiSearchService(
    { chatCompletion } as any,
    { findAll: jest.fn().mockResolvedValue(LOCATIONS) } as any,
    { findAll: jest.fn().mockResolvedValue(TYPES) } as any,
    { findAll: jest.fn().mockResolvedValue(FEATURES) } as any,
    usage as any,
    tenants as any,
  );
  (svc as any).logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() };
  const tenant = { id: 1, aiSearchEnabled: opts.enabled ?? true } as any;
  return { svc, tenant, chatCompletion, usage };
}

describe('AI search', () => {
  it('turns a sentence into filters the search understands', async () => {
    const { svc, tenant } = build(JSON.stringify({
      filters: { locationId: 11, propertyTypeId: 21, minBedrooms: 3, maxPrice: 500000, features: [31] },
      interpretation: 'Villas in Marbella with a pool',
    }));
    const { filters, interpretation } = await svc.search(tenant, '3 bed villa in Marbella with a pool under 500k');
    expect(filters).toEqual({ locationId: 11, propertyTypeId: 21, minBedrooms: 3, maxPrice: 500000, features: [31] });
    expect(interpretation).toBe('Villas in Marbella with a pool');
  });

  it('reads JSON the model wrapped in a code fence', async () => {
    const { svc, tenant } = build('```json\n{"filters":{"locationId":12}}\n```');
    await expect(svc.search(tenant, 'estepona')).resolves.toMatchObject({ filters: { locationId: 12 } });
  });

  it('drops ids that belong to no list on this website', async () => {
    const { svc, tenant } = build(JSON.stringify({
      filters: { locationId: 999, propertyTypeId: 21, features: [31, 4242] },
    }));
    const { filters } = await svc.search(tenant, 'anything');
    expect(filters.locationId).toBeUndefined();
    expect(filters.propertyTypeId).toBe(21);
    expect(filters.features).toEqual([31]);
  });

  it('accepts a price the model sent as text, and puts a backwards range right', async () => {
    const { svc, tenant } = build(JSON.stringify({ filters: { minPrice: '800000', maxPrice: '300,000' } }));
    const { filters } = await svc.search(tenant, 'between 300k and 800k');
    expect(filters.minPrice).toBe(300000);
    expect(filters.maxPrice).toBe(800000);
  });

  it('refuses a listing type it does not have', async () => {
    const { svc, tenant } = build(JSON.stringify({ filters: { listingType: 'timeshare', minBedrooms: 2 } }));
    const { filters } = await svc.search(tenant, 'two bed timeshare');
    expect(filters.listingType).toBeUndefined();
    expect(filters.minBedrooms).toBe(2);
  });

  it('says so plainly when the model answers with prose', async () => {
    const { svc, tenant } = build('I am sorry, I could not work that out.');
    await expect(svc.search(tenant, 'hmm')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('never calls the model when the client has no key of their own', async () => {
    const { svc, tenant, chatCompletion } = build('{}', { key: null });
    await expect(svc.search(tenant, 'villa in Marbella')).rejects.toBeInstanceOf(ForbiddenException);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('never calls the model when the feature is switched off', async () => {
    const { svc, tenant, chatCompletion } = build('{}', { enabled: false });
    await expect(svc.search(tenant, 'villa')).rejects.toBeInstanceOf(ForbiddenException);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('stops at the client’s daily ceiling, before spending anything', async () => {
    const { svc, tenant, chatCompletion } = build('{}', { usedToday: 50, limit: 50 });
    await expect(svc.search(tenant, 'villa')).rejects.toBeInstanceOf(ForbiddenException);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('counts a search that goes through', async () => {
    const { svc, tenant, usage } = build(JSON.stringify({ filters: { locationId: 11 } }), { usedToday: 3, limit: 50 });
    await svc.search(tenant, 'marbella');
    expect(usage.query).toHaveBeenCalledWith(expect.stringContaining('ON DUPLICATE KEY UPDATE'), [1, expect.any(String)]);
  });

  it('refuses a wall of pasted text before it reaches the model', async () => {
    const { svc, tenant, chatCompletion } = build('{}');
    await expect(svc.search(tenant, 'x'.repeat(401))).rejects.toBeInstanceOf(BadRequestException);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('asks the model with the client’s own key, never the platform one', async () => {
    const { svc, tenant, chatCompletion } = build(JSON.stringify({ filters: { locationId: 11 } }));
    await svc.search(tenant, 'marbella');
    expect(chatCompletion).toHaveBeenCalledWith(
      1,
      expect.any(Array),
      expect.objectContaining({ allowPlatformKey: false }),
    );
  });

  it('gives the model only this client’s places and types', async () => {
    const { svc, tenant, chatCompletion } = build(JSON.stringify({ filters: {} }));
    await svc.search(tenant, 'anything').catch(() => undefined);
    const [, messages] = chatCompletion.mock.calls[0];
    expect(messages[0].content).toContain('11: Marbella');
    expect(messages[0].content).toContain('21: Villa');
    expect(messages[1].content).toContain('anything');
  });
});
