import { PropertyTypeService } from './property-type.service';

// A manual move must take the type out of AI's control, or the next AI Organize
// run moves it straight back and the user's correction disappears. The lock the
// enrichment pass reads is `parentId != null && !aiAssigned`, so these two
// service methods are the only things that can ever set it.

function makeService(rows: Array<{ id: number; tenantId: number; slug: string; parentId: number | null }>) {
  const updates: Array<{ where: any; data: any }> = [];
  const qbSets: any[] = [];

  const repo: any = {
    findOne: async ({ where }: any) => rows.find((r) => r.id === where.id) || null,
    update: async (where: any, data: any) => void updates.push({ where, data }),
    createQueryBuilder: () => {
      const qb: any = {
        update: () => qb,
        set: (data: any) => {
          qbSets.push(data);
          return qb;
        },
        where: () => qb,
        andWhere: () => qb,
        execute: async () => ({}),
      };
      return qb;
    },
  };

  return { svc: new PropertyTypeService(repo), updates, qbSets };
}

const VILLAS = { id: 1, tenantId: 1, slug: 'villas', parentId: null };
const DUPLEX = { id: 2, tenantId: 1, slug: 'duplex', parentId: 9 };

describe('manual property-type moves clear aiAssigned', () => {
  it('clears the flag when the edit dialog sets a parent', async () => {
    const { svc, updates } = makeService([VILLAS, DUPLEX]);

    await svc.update(1, 2, { parentId: 1 } as any);

    expect(updates[0].data).toEqual({ parentId: 1, aiAssigned: false });
  });

  // The visibility toggle and renames send no parentId — they must not lock a
  // type that AI is still legitimately managing.
  it('leaves the flag alone on an edit that does not touch the parent', async () => {
    const { svc, updates } = makeService([DUPLEX]);

    await svc.update(1, 2, { isActive: false } as any);

    expect(updates[0].data).toEqual({ isActive: false });
    expect(updates[0].data).not.toHaveProperty('aiAssigned');
  });

  it('clears the flag on a drag-and-drop bulk move', async () => {
    const { svc, qbSets } = makeService([VILLAS, DUPLEX]);

    await svc.bulkMove(1, [2], 1);

    expect(qbSets).toEqual([{ parentId: 1, aiAssigned: false }]);
  });

  it('clears the flag when moving a type out to top level', async () => {
    const { svc, qbSets } = makeService([DUPLEX]);

    await svc.bulkMove(1, [2], null);

    expect(qbSets).toEqual([{ parentId: null, aiAssigned: false }]);
  });
});
