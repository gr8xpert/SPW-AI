import { LocationTemplateService } from './location-template.service';
import { PropertyTypeTemplateService } from '../property-type-template/property-type-template.service';

// Applying a template rewrites clients' public location/type rows and moves
// their listings, so every affected client gets exactly one syncVersion bump
// per apply — after its writes — and unaffected clients get none.

function locationTemplate(opts: {
  listings?: any[];
  nodes?: any[];
  locations?: any[];
} = {}) {
  const events: string[] = [];
  const nodes = opts.nodes ?? [];
  const locations = opts.locations ?? [];
  const nodeRepository = {
    find: async ({ where }: any = {}) =>
      where?.parentId !== undefined ? nodes.filter((n) => n.parentId === where.parentId) : nodes,
    findOne: async ({ where }: any) => nodes.find((n) => n.id === where.id) || null,
    save: async (n: any) => n,
    update: async () => undefined,
    delete: async () => undefined,
  };
  const locationRepository = {
    find: async ({ where }: any) => locations.filter((l) => l.templateNodeId === where.templateNodeId),
    findOne: async ({ where }: any) =>
      locations.find((l) => l.tenantId === where.tenantId && l.templateNodeId === where.templateNodeId) || null,
    update: async () => void events.push('relink'),
  };
  const propertyRepository = {
    find: async () => opts.listings ?? [],
    update: async ({ id }: any) => void events.push(`move:${id}`),
  };
  const unmatchedRepository = { update: async () => undefined };
  const locationService = {
    mergeInto: async (tenantId: number) => void events.push(`mergeInto:${tenantId}`),
  };
  const tenantService = {
    bumpSyncVersionSafely: jest.fn(async (tenantId: number) => void events.push(`bump:${tenantId}`)),
  };
  const service = new LocationTemplateService(
    nodeRepository as any,
    unmatchedRepository as any,
    locationRepository as any,
    propertyRepository as any,
    locationService as any,
    tenantService as any,
  );
  return { service, events, tenantService };
}

const ctx = (tenantId: number) => ({
  tenantId,
  stats: { created: 0, adopted: 0, moved: 0, renamed: 0 },
});

describe('LocationTemplateService.reapplyTenant syncVersion bump', () => {
  it('bumps once after all listings are re-placed', async () => {
    const { service, events, tenantService } = locationTemplate({
      listings: [
        { id: 1, locationId: 100, feedLocation: {} },
        { id: 2, locationId: 100, feedLocation: {} },
      ],
    });
    jest.spyOn(service, 'createRunContext').mockResolvedValue(ctx(3) as any);
    jest.spyOn(service, 'placeListing').mockResolvedValue(200);
    jest.spyOn(service, 'cleanupRedundantRows').mockResolvedValue(0);

    const r = await service.reapplyTenant(3);

    expect(r.relocated).toBe(2);
    expect(tenantService.bumpSyncVersionSafely).toHaveBeenCalledTimes(1);
    expect(tenantService.bumpSyncVersionSafely).toHaveBeenCalledWith(3, expect.any(String));
    expect(events).toEqual(['move:1', 'move:2', 'bump:3']);
  });

  it('bumps when rows were renamed even if no listing moved', async () => {
    const { service, tenantService } = locationTemplate({ listings: [] });
    const c = ctx(3);
    jest.spyOn(service, 'createRunContext').mockImplementation(async () => {
      c.stats.renamed = 1;
      return c as any;
    });
    jest.spyOn(service, 'cleanupRedundantRows').mockResolvedValue(0);

    await service.reapplyTenant(3);

    expect(tenantService.bumpSyncVersionSafely).toHaveBeenCalledTimes(1);
  });

  it('a re-apply that changed nothing does not bump', async () => {
    const { service, tenantService } = locationTemplate({
      listings: [{ id: 1, locationId: 200, feedLocation: {} }],
    });
    jest.spyOn(service, 'createRunContext').mockResolvedValue(ctx(3) as any);
    jest.spyOn(service, 'placeListing').mockResolvedValue(200); // already there
    jest.spyOn(service, 'cleanupRedundantRows').mockResolvedValue(0);

    await service.reapplyTenant(3);

    expect(tenantService.bumpSyncVersionSafely).not.toHaveBeenCalled();
  });

  it('re-apply across tenants bumps once per affected tenant', async () => {
    const { service, tenantService } = locationTemplate({
      listings: [{ id: 1, locationId: 100, feedLocation: {} }],
    });
    jest.spyOn(service, 'createRunContext').mockImplementation(async (tenantId: number) => ctx(tenantId) as any);
    // Tenant 2's listing is already in place; tenants 1 and 3 move.
    jest
      .spyOn(service, 'placeListing')
      .mockImplementation(async (c: any) => (c.tenantId === 2 ? 100 : 200));
    jest.spyOn(service, 'cleanupRedundantRows').mockResolvedValue(0);

    await service.reapplyTenants([1, 2, 3, 1]);

    expect(tenantService.bumpSyncVersionSafely.mock.calls.map((c) => c[0])).toEqual([1, 3]);
  });
});

describe('LocationTemplateService.merge syncVersion bump', () => {
  const node = (id: number, name: string) => ({
    id,
    parentId: null,
    level: 'region',
    name,
    nameKey: name.toLowerCase(),
    aliases: null,
    status: 'ok',
    lat: null,
    lng: null,
  });

  it('bumps each client whose rows were folded together, once, after the merge', async () => {
    const { service, events, tenantService } = locationTemplate({
      nodes: [node(1, 'Andalusia'), node(2, 'Andalucia')],
      locations: [
        // Tenants 7 and 8 have rows for both: merged.
        { id: 70, tenantId: 7, templateNodeId: 1 },
        { id: 71, tenantId: 7, templateNodeId: 2 },
        { id: 80, tenantId: 8, templateNodeId: 1 },
        { id: 81, tenantId: 8, templateNodeId: 2 },
        // Tenant 9 only has the duplicate: just relinked (private link).
        { id: 90, tenantId: 9, templateNodeId: 1 },
      ],
    });

    const tally = await service.merge(1, 2);

    expect(tally.clientRowsMerged).toBe(2);
    expect(tally.clientRowsRelinked).toBe(1);
    expect(tenantService.bumpSyncVersionSafely.mock.calls.map((c) => c[0])).toEqual([7, 8]);
    // Bumps come after every write of the merge.
    expect(events).toEqual(['mergeInto:7', 'mergeInto:8', 'relink', 'bump:7', 'bump:8']);
  });
});

describe('PropertyTypeTemplateService.reapplyTenant syncVersion bump', () => {
  it('bumps once after the listings are re-typed', async () => {
    const events: string[] = [];
    const propertyRepository = {
      find: async () => [
        { id: 1, propertyTypeId: 5, feedType: {} },
        { id: 2, propertyTypeId: 5, feedType: {} },
      ],
      update: async ({ id }: any) => void events.push(`move:${id}`),
    };
    const tenantService = {
      bumpSyncVersionSafely: jest.fn(async (t: number) => void events.push(`bump:${t}`)),
    };
    const service = new PropertyTypeTemplateService(
      {} as any,
      {} as any,
      {} as any,
      propertyRepository as any,
      {} as any,
      tenantService as any,
    );
    jest.spyOn(service, 'createRunContext').mockResolvedValue(ctx(4) as any);
    jest.spyOn(service, 'placeListing').mockResolvedValue(6);
    jest.spyOn(service, 'cleanupRedundantRows').mockResolvedValue(0);

    await service.reapplyTenant(4);

    expect(events).toEqual(['move:1', 'move:2', 'bump:4']);
  });
});
