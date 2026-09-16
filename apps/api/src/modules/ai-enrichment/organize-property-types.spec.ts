import { AiEnrichmentService } from './ai-enrichment.service';

// Exercises enrichPropertyTypes with hand-rolled fakes, same approach as
// merge-duplicate-areas.spec.ts — what's under test is which rows the pass is
// willing to touch, not persistence.

type Row = {
  id: number;
  slug: string;
  parentId: number | null;
  name: { en: string };
  aiAssigned: boolean;
};

interface Answer {
  merges?: Record<string, string[]>;
  groups?: Record<string, string[]>;
  root?: string[];
}

function makeService(rows: Row[], counts: Record<number, number>, answer: Answer | null) {
  const updates: Array<{ id: number; data: any }> = [];
  const merges: Array<{ sourceIds: number[]; targetId: number }> = [];
  const created: Row[] = [];
  let nextId = Math.max(0, ...rows.map((r) => r.id)) + 1;

  const propertyTypeRepository = {
    find: async () => [...rows],
    findOne: async ({ where }: any) => rows.find((r) => r.slug === where.slug) || null,
    create: (data: any) => ({ ...data }),
    save: async (data: any) => {
      const row: Row = { id: nextId++, parentId: null, aiAssigned: true, ...data };
      rows.push(row);
      created.push(row);
      return row;
    },
    update: async (id: number, data: any) => {
      updates.push({ id, data });
      const row = rows.find((r) => r.id === id);
      if (row) Object.assign(row, data);
    },
    manager: {
      query: async () =>
        Object.entries(counts).map(([propertyTypeId, cnt]) => ({
          propertyTypeId: Number(propertyTypeId),
          cnt: String(cnt),
        })),
    },
  };

  const propertyTypeService = {
    merge: async (_tenantId: number, sourceIds: number[], targetId: number) => {
      merges.push({ sourceIds, targetId });
      for (const id of sourceIds) {
        const i = rows.findIndex((r) => r.id === id);
        if (i >= 0) rows.splice(i, 1);
      }
      return { mergedTypes: sourceIds.length, movedProperties: 0 };
    },
  };

  const svc = new (AiEnrichmentService as any)(
    {},
    propertyTypeRepository,
    {},
    {},
    {},
    propertyTypeService,
  ) as AiEnrichmentService;

  (svc as any).askAiForTypeOrganisation = async () => answer;

  return { svc, updates, merges, created, rows };
}

const run = (svc: AiEnrichmentService) => svc.enrichPropertyTypes(1);

const type = (id: number, en: string, over: Partial<Row> = {}): Row => ({
  id,
  slug: en.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  parentId: null,
  name: { en },
  aiAssigned: false,
  ...over,
});

describe('enrichPropertyTypes', () => {
  describe('merges', () => {
    it('folds a plural variant into the type holding the listings', async () => {
      const rows = [type(1, 'Apartment'), type(2, 'Apartments')];
      const { svc, merges } = makeService(rows, { 1: 412, 2: 3 }, {
        merges: { Apartments: ['Apartment'] },
      });

      const res = await run(svc);

      // The model named "Apartments" as canonical; we keep the row with the
      // listings regardless, because that's the one already wired into feeds.
      expect(merges).toEqual([{ sourceIds: [2], targetId: 1 }]);
      expect(res.typesMerged).toBe(1);
    });

    it('ignores a merge naming a type this tenant does not have', async () => {
      const rows = [type(1, 'Apartment'), type(2, 'Villa')];
      const { svc, merges } = makeService(rows, { 1: 5, 2: 5 }, {
        merges: { Apartment: ['Flat'] },
      });

      const res = await run(svc);

      expect(merges).toEqual([]);
      expect(res.typesMerged).toBe(0);
    });

    // A parent/child pair is a hierarchy someone built on purpose. Collapsing
    // it would silently delete a level of the tree.
    it('refuses to merge a type into its own parent', async () => {
      const rows = [type(1, 'Villa'), type(2, 'Detached Villa', { parentId: 1 })];
      const { svc, merges } = makeService(rows, { 1: 10, 2: 4 }, {
        merges: { Villa: ['Detached Villa'] },
      });

      await expect(run(svc)).resolves.toMatchObject({ typesMerged: 0 });
      expect(merges).toEqual([]);
    });

    it('never merges a type the user arranged by hand', async () => {
      const rows = [
        type(1, 'Apartment'),
        type(2, 'Apartments', { parentId: 3, aiAssigned: false }),
        type(3, 'Residential'),
      ];
      const { svc, merges } = makeService(rows, { 1: 400, 2: 2 }, {
        merges: { Apartment: ['Apartments'] },
      });

      await expect(run(svc)).resolves.toMatchObject({ typesMerged: 0 });
      expect(merges).toEqual([]);
    });
  });

  describe('grouping', () => {
    it('re-parents an AI-assigned type on a re-run', async () => {
      const rows = [
        type(1, 'Houses'),
        type(2, 'Detached Villa', { parentId: 1, aiAssigned: true }),
        type(3, 'Semi-Detached Villa', { parentId: 1, aiAssigned: true }),
      ];
      const { svc, updates, created } = makeService(rows, {}, {
        groups: { Villas: ['Detached Villa', 'Semi-Detached Villa'] },
      });

      const res = await run(svc);

      expect(created.map((c) => c.name.en)).toEqual(['Villas']);
      const villasId = created[0].id;
      expect(updates).toEqual([
        { id: 2, data: { parentId: villasId, aiAssigned: true } },
        { id: 3, data: { parentId: villasId, aiAssigned: true } },
      ]);
      expect(res.parentsCreated).toBe(1);
      expect(res.childrenAttached).toBe(2);
    });

    it('leaves a type the user parented by hand where it is', async () => {
      const rows = [
        type(1, 'Houses'),
        type(2, 'Detached Villa', { parentId: 1, aiAssigned: false }),
        type(3, 'Semi-Detached Villa', { parentId: null, aiAssigned: false }),
        type(4, 'Country Villa', { parentId: null, aiAssigned: false }),
      ];
      const { svc, updates } = makeService(rows, {}, {
        groups: { Villas: ['Detached Villa', 'Semi-Detached Villa', 'Country Villa'] },
      });

      const res = await run(svc);

      expect(updates.map((u) => u.id)).toEqual([3, 4]);
      expect(res.skipped).toBe(1);
    });

    it('reuses an existing parent instead of creating a duplicate', async () => {
      const rows = [
        type(1, 'Villas'),
        type(2, 'Detached Villa'),
        type(3, 'Semi-Detached Villa'),
      ];
      const { svc, created, updates } = makeService(rows, {}, {
        groups: { Villas: ['Detached Villa', 'Semi-Detached Villa'] },
      });

      const res = await run(svc);

      expect(created).toEqual([]);
      expect(updates.map((u) => u.data.parentId)).toEqual([1, 1]);
      expect(res.parentsCreated).toBe(0);
    });

    it('ignores a group with fewer than two real children', async () => {
      const rows = [type(1, 'Villa'), type(2, 'Apartment')];
      const { svc, updates, created } = makeService(rows, {}, {
        groups: { Villas: ['Villa'] },
      });

      await expect(run(svc)).resolves.toMatchObject({ parentsCreated: 0, childrenAttached: 0 });
      expect(updates).toEqual([]);
      expect(created).toEqual([]);
    });

    // Guards against the model handing back a parent that is itself nested
    // under one of the children it was given.
    it('refuses to nest a parent under its own descendant', async () => {
      const rows = [
        type(1, 'Villas', { parentId: 2, aiAssigned: true }),
        type(2, 'Detached Villa'),
        type(3, 'Semi-Detached Villa'),
      ];
      const { svc, updates } = makeService(rows, {}, {
        groups: { Villas: ['Detached Villa', 'Semi-Detached Villa'] },
      });

      const res = await run(svc);

      // Only the safe child moves; "Detached Villa" would have become its own
      // grandparent.
      expect(updates.map((u) => u.id)).toEqual([3]);
      expect(res.skipped).toBe(1);
    });
  });

  describe('detaching', () => {
    it('moves a type to top level only when the model names it in root', async () => {
      const rows = [
        type(1, 'Villas'),
        type(2, 'Plot', { parentId: 1, aiAssigned: true }),
        type(3, 'Detached Villa', { parentId: 1, aiAssigned: true }),
      ];
      const { svc, updates } = makeService(rows, {}, { root: ['Plot'] });

      const res = await run(svc);

      expect(updates).toEqual([{ id: 2, data: { parentId: null, aiAssigned: true } }]);
      expect(res.detached).toBe(1);
    });

    it('does not detach a type the user parented by hand', async () => {
      const rows = [type(1, 'Villas'), type(2, 'Plot', { parentId: 1, aiAssigned: false })];
      const { svc, updates } = makeService(rows, {}, { root: ['Plot'] });

      await expect(run(svc)).resolves.toMatchObject({ detached: 0 });
      expect(updates).toEqual([]);
    });
  });

  it('does nothing when the model returns nothing at all', async () => {
    const rows = [type(1, 'Villa'), type(2, 'Apartment')];
    const { svc, updates, merges } = makeService(rows, {}, null);

    const res = await run(svc);

    expect(updates).toEqual([]);
    expect(merges).toEqual([]);
    expect(res.skipped).toBe(2);
  });

  it('is a no-op for a tenant with fewer than two types', async () => {
    const rows = [type(1, 'Villa')];
    const { svc, updates } = makeService(rows, {}, { groups: { Villas: ['Villa'] } });

    await expect(run(svc)).resolves.toMatchObject({ parentsCreated: 0, childrenAttached: 0 });
    expect(updates).toEqual([]);
  });
});
