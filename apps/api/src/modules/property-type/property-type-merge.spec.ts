import { ConflictException } from '@nestjs/common';
import { PropertyTypeService } from './property-type.service';
import { PropertyTypeTemplateService } from '../property-type-template/property-type-template.service';

// Several feeds send their own name for one type, and the client merges them.
// The merge is only worth anything if it survives the next import, so these
// walk the whole loop: merge, then place the same feed listing again.

const GROUP = { id: 1, parentId: null, name: 'House', nameKey: 'house', codes: ['2-1'], aliases: null, status: 'ok', translations: null };
const SEMI = { id: 2, parentId: 1, name: 'Semi-Detached House', nameKey: 'semi detached house', codes: ['2-2'], aliases: null, status: 'ok', translations: null };
const SEMI2 = { id: 3, parentId: 1, name: 'Semidetached', nameKey: 'semidetached', codes: ['2-3'], aliases: null, status: 'ok', translations: null };
const NODES = [GROUP, SEMI, SEMI2];

function makeStore(initial: any[]) {
  let rows = initial.map((r) => ({ tenantId: 1, feedKeys: null, aliases: null, userLocked: false, ...r }));
  let nextId = 100;
  const repo: any = {
    find: async ({ where }: any = {}) =>
      rows.filter((r) => !where?.id?.value || where.id.value.includes(r.id)).map((r) => ({ ...r })),
    findOne: async ({ where }: any) => {
      const r = rows.find((x) => (where.id == null || x.id === where.id) && (where.slug == null || x.slug === where.slug));
      return r ? { ...r } : null;
    },
    update: async (where: any, data: any) => {
      rows = rows.map((r) => (r.id === where.id ? { ...r, ...data } : r));
    },
    create: (data: any) => data,
    save: async (data: any) => {
      const row = { tenantId: 1, feedKeys: null, aliases: null, userLocked: false, id: nextId++, ...data };
      rows.push(row);
      return row;
    },
    createQueryBuilder: () => {
      let op = '';
      let set: any = null;
      let ids: number[] = [];
      const qb: any = {
        update: () => ((op = 'update'), qb),
        delete: () => ((op = 'delete'), qb),
        set: (d: any) => ((set = d), qb),
        where: () => qb,
        andWhere: (_: string, p: any) => ((ids = p?.ids || []), qb),
        execute: async () => {
          if (op === 'delete') rows = rows.filter((r) => !ids.includes(r.id));
          else rows = rows.map((r) => (ids.includes(r.parentId) ? { ...r, ...set } : r));
          return {};
        },
      };
      return qb;
    },
    manager: {
      query: async (sql: string) => (sql.startsWith('UPDATE properties') ? { affectedRows: 3 } : []),
    },
  };
  return { repo, rows: () => rows };
}

function makeServices(initial: any[]) {
  const store = makeStore(initial);
  const service = new PropertyTypeService(store.repo);
  const nodeRepo: any = { find: async () => NODES };
  const template = new PropertyTypeTemplateService(nodeRepo, {} as any, store.repo, {} as any, {} as any, {} as any);
  const place = async (input: any) => {
    const ctx = await template.createRunContext(1, 'kyero', { recordUnmatched: false });
    return template.placeListing(ctx!, input);
  };
  return { service, store, place };
}

const HOUSE = { id: 10, parentId: null, name: { en: 'House' }, slug: 'house', templateNodeId: 1 };
const KEEP = { id: 11, parentId: 10, name: { en: 'Semi-Detached House' }, slug: 'semi-detached-house', templateNodeId: 2 };
const DUP = { id: 12, parentId: 10, name: { en: 'Semidetached' }, slug: 'semidetached', templateNodeId: 3 };

describe('merging property types', () => {
  it('without a merge, each feed name has its own type', async () => {
    const { place } = makeServices([HOUSE, KEEP, DUP]);
    expect(await place({ name: 'Semidetached' })).toBe(12);
  });

  it('after a merge, the next import puts the merged name in the target instead of re-creating it', async () => {
    const { service, store, place } = makeServices([HOUSE, KEEP, DUP]);
    await service.merge(1, [12], 11);

    expect(store.rows().find((r) => r.id === 12)).toBeUndefined();
    expect(await place({ name: 'Semidetached' })).toBe(11);
    expect(await place({ code: '2-3' })).toBe(11);
    expect(store.rows().length).toBe(2);
  });

  it('the target keeps its own template link and name', async () => {
    const { service, store, place } = makeServices([HOUSE, KEEP, DUP]);
    await service.merge(1, [12], 11);
    await place({ name: 'Semidetached' });

    const target = store.rows().find((r) => r.id === 11)!;
    expect(target.templateNodeId).toBe(2);
    expect(target.name.en).toBe('Semi-Detached House');
  });

  it('a name the template does not know stays merged too', async () => {
    const odd = { id: 13, parentId: 10, name: { en: 'Pareado' }, slug: 'pareado', templateNodeId: null };
    const { service, store, place } = makeServices([HOUSE, KEEP, odd]);
    await service.merge(1, [13], 11);

    expect(await place({ name: 'Pareado', parentName: 'House' })).toBe(11);
    expect(await place({ name: 'Pareado' })).toBe(11);
    expect(store.rows().length).toBe(2);
  });

  it('a chain of merges keeps every name', async () => {
    const odd = { id: 13, parentId: 10, name: { en: 'Pareado' }, slug: 'pareado', templateNodeId: null };
    const { service, place } = makeServices([HOUSE, KEEP, DUP, odd]);
    await service.merge(1, [13], 12);
    await service.merge(1, [12], 11);

    expect(await place({ name: 'Pareado' })).toBe(11);
    expect(await place({ name: 'Semidetached' })).toBe(11);
  });

  it('other spellings move with the merge', async () => {
    const dup = { ...DUP, aliases: ['Adosado'] };
    const { service, place } = makeServices([HOUSE, KEEP, dup]);
    await service.merge(1, [12], 11);
    expect(await place({ name: 'adosado' })).toBe(11);
  });

  it('refuses to merge a type into itself or one of its sub-types', async () => {
    const { service } = makeServices([HOUSE, KEEP, DUP]);
    await expect(service.mergeType(1, 11, 11)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.mergeType(1, 10, 11)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('moving property types', () => {
  it('refuses to move a type under its own sub-type', async () => {
    const { service } = makeServices([HOUSE, KEEP, DUP]);
    await expect(service.update(1, 10, { parentId: 11 } as any)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.bulkMove(1, [10], 11)).rejects.toBeInstanceOf(ConflictException);
  });

  it('still moves between branches', async () => {
    const { service, store } = makeServices([HOUSE, KEEP, DUP]);
    await service.update(1, 12, { parentId: 11 } as any);
    expect(store.rows().find((r) => r.id === 12)!.parentId).toBe(11);
  });
});

describe('other spellings on a type', () => {
  it('a feed name in the list lands in that type, ahead of the template', async () => {
    const { service, place, store } = makeServices([HOUSE, KEEP, DUP]);
    await service.update(1, 11, { aliases: ['Semidetached', 'Adosado'] } as any);

    expect(await place({ name: 'semidetached' })).toBe(11);
    expect(await place({ name: 'Adosado', parentName: 'House' })).toBe(11);
    expect(store.rows().length).toBe(3);
  });

  it('cleans the list: trimmed, no duplicates, not its own name', async () => {
    const { service, store } = makeServices([HOUSE, KEEP]);
    await service.update(1, 11, { aliases: [' Adosado ', 'adosado', 'Semi-Detached House', ''] } as any);
    expect(store.rows().find((r) => r.id === 11)!.aliases).toEqual(['Adosado']);
  });

  it('an empty list clears them', async () => {
    const { service, store } = makeServices([HOUSE, { ...KEEP, aliases: ['Adosado'] }]);
    await service.update(1, 11, { aliases: [] } as any);
    expect(store.rows().find((r) => r.id === 11)!.aliases).toBeNull();
  });
});
