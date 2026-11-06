import { LocationTransferService } from './location-transfer.service';

// Import setup with createMissing: a new client whose feed sends bare towns
// gets its countries and areas from the file, and the feed's towns move under
// them. Without the option nothing is created.

function setup(existing: any[]) {
  let nextId = 100;
  const saved: any[] = [];
  const updates: Array<{ id: number; patch: any }> = [];
  const repo = {
    find: jest.fn(async () => existing),
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => {
      const row = { ...v, id: nextId++ };
      saved.push(row);
      return row;
    }),
    update: jest.fn(async (where: any, patch: any) => void updates.push({ id: where.id, patch })),
  };
  const locationService = {
    rememberOrigins: jest.fn(async () => undefined),
    markUserLocked: jest.fn(async () => undefined),
    mergeInto: jest.fn(async () => undefined),
  };
  return { service: new LocationTransferService(repo as any, locationService as any), saved, updates };
}

const file = JSON.stringify({
  format: 'spm-locations',
  version: 1,
  items: [
    { ref: 1, parentRef: null, level: 'region', name: { en: 'United Arab Emirates' } },
    { ref: 2, parentRef: 1, level: 'province', name: { en: 'Dubai' } },
    { ref: 3, parentRef: 2, level: 'town', name: { en: 'JVC' } },
    { ref: 4, parentRef: 2, level: 'town', name: { en: 'Business Bay' } },
  ],
});

// What a Kyero feed with only <town> leaves: a top-level town.
const feedTown = { id: 7, parentId: null, level: 'town', name: { en: 'JVC' }, slug: 'jvc', feedKeys: null, propertyCount: 9 };

describe('LocationTransferService createMissing', () => {
  it('without the option creates nothing', async () => {
    const { service, saved } = setup([{ ...feedTown }]);
    const r = await service.import(5, file, true);
    expect(saved).toHaveLength(0);
    expect(r.created).toBe(0);
    expect(r.notInAccount).toBe(3);
    expect(r.keptInPlace).toBe(1);
  });

  it('dry run counts what would be added and moved, writes nothing', async () => {
    const { service, saved, updates } = setup([{ ...feedTown }]);
    const r = await service.import(5, file, false, true);
    expect(r.created).toBe(3);
    expect(r.moved).toBe(1);
    expect(r.notInAccount).toBe(0);
    expect(saved).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it('adds the missing tree and moves the feed town under it', async () => {
    const { service, saved, updates } = setup([{ ...feedTown }]);
    const r = await service.import(5, file, true, true);
    expect(r.created).toBe(3);
    const uae = saved.find((s) => s.name.en === 'United Arab Emirates');
    const dubai = saved.find((s) => s.name.en === 'Dubai');
    const bb = saved.find((s) => s.name.en === 'Business Bay');
    expect(uae).toMatchObject({ parentId: null, level: 'region', slug: 'united-arab-emirates', userLocked: true });
    expect(dubai).toMatchObject({ parentId: uae.id, level: 'province' });
    // A bare "Business Bay" from the feed finds this row, not a top-level twin.
    expect(bb).toMatchObject({ parentId: dubai.id, level: 'town', slug: 'business-bay', feedKeys: ['x:0:business bay'] });
    expect(updates).toContainEqual({ id: 7, patch: expect.objectContaining({ parentId: dubai.id }) });
  });
});
