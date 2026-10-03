import { Brackets } from 'typeorm';
import { SuperAdminService, escapeLike } from './super-admin.service';

// Plain-object mocks, matching the other specs in this app: the service is
// built with `new` and only the collaborators listClients touches are real
// jest.fn()s. The tenant query builder records every call so the test can
// check which conditions were added; the Brackets factory is replayed into a
// recorder to read back the OR-ed search clauses.

function makeTenantQb(rows: any[] = [], total = rows.length) {
  const calls: { method: string; args: any[] }[] = [];
  const qb: any = {};
  for (const m of ['leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'skip', 'take']) {
    qb[m] = jest.fn((...args: any[]) => {
      calls.push({ method: m, args });
      return qb;
    });
  }
  qb.getManyAndCount = jest.fn().mockResolvedValue([rows, total]);
  return { qb, calls };
}

function makeUserCountQb(raw: any[] = []) {
  const qb: any = {};
  for (const m of ['select', 'addSelect', 'where', 'groupBy']) qb[m] = jest.fn(() => qb);
  qb.getRawMany = jest.fn().mockResolvedValue(raw);
  return qb;
}

function makeService(tenantQb: any, userQb = makeUserCountQb()) {
  const tenantRepository = { createQueryBuilder: jest.fn(() => tenantQb) };
  const userRepository = { createQueryBuilder: jest.fn(() => userQb) };
  const none = {} as any;
  const service = new SuperAdminService(
    tenantRepository as any,
    userRepository as any,
    none, none, none, none, none, none, none, none, none, none, none, none,
  );
  return { service, tenantRepository };
}

/** Replays a Brackets factory and returns the SQL fragments it OR-ed together. */
function bracketClauses(brackets: Brackets): string[] {
  const clauses: string[] = [];
  const w: any = {
    where: (sql: string) => (clauses.push(sql), w),
    orWhere: (sql: string) => (clauses.push(sql), w),
  };
  brackets.whereFactory(w);
  return clauses;
}

describe('escapeLike', () => {
  it('escapes %, _ and backslash so they match literally', () => {
    expect(escapeLike('50%_off\\x')).toBe('50\\%\\_off\\\\x');
    expect(escapeLike('plain-slug')).toBe('plain-slug');
  });
});

describe('SuperAdminService.listClients search', () => {
  it('matches name, slug, domain, owner email and any user email in one OR group', async () => {
    const { qb, calls } = makeTenantQb();
    const { service } = makeService(qb);

    await service.listClients({ search: '  Acme_Co ' });

    const searchCall = calls.find((c) => c.method === 'andWhere' && c.args[0] instanceof Brackets);
    expect(searchCall).toBeDefined();
    // Trimmed, lowercased, wildcard-escaped, wrapped for a contains match.
    expect(searchCall!.args[1]).toEqual({ search: '%acme\\_co%' });

    const clauses = bracketClauses(searchCall!.args[0]);
    expect(clauses).toEqual([
      'LOWER(tenant.name) LIKE :search',
      'LOWER(tenant.slug) LIKE :search',
      'LOWER(tenant.domain) LIKE :search',
      'LOWER(tenant.ownerEmail) LIKE :search',
      expect.stringContaining('EXISTS (SELECT 1 FROM users u WHERE u.tenantId = tenant.id'),
    ]);
    // Users are matched via EXISTS, never joined, so tenants can't repeat.
    expect(qb.leftJoinAndSelect).toHaveBeenCalledTimes(1);
    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('tenant.plan', 'plan');
  });

  it('adds no search condition for an empty or whitespace-only term', async () => {
    const { qb, calls } = makeTenantQb();
    const { service } = makeService(qb);

    await service.listClients({ search: '   ' });

    expect(calls.some((c) => c.args[0] instanceof Brackets)).toBe(false);
  });

  it('keeps the platform exclusion and the other filters alongside the search', async () => {
    const { qb } = makeTenantQb();
    const { service } = makeService(qb);

    await service.listClients({
      search: 'acme',
      subscriptionStatus: 'grace',
      isActive: true,
      planId: 3,
      page: 2,
      limit: 10,
      sortBy: 'name',
      sortOrder: 'ASC',
    });

    expect(qb.where).toHaveBeenCalledWith('tenant.slug != :platformSlug', expect.any(Object));
    expect(qb.andWhere).toHaveBeenCalledWith('tenant.subscriptionStatus = :subscriptionStatus', { subscriptionStatus: 'grace' });
    expect(qb.andWhere).toHaveBeenCalledWith('tenant.isActive = :isActive', { isActive: true });
    expect(qb.andWhere).toHaveBeenCalledWith('tenant.planId = :planId', { planId: 3 });
    expect(qb.orderBy).toHaveBeenCalledWith('tenant.name', 'ASC');
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(10);
  });

  it('returns the same response shape with the total from getManyAndCount', async () => {
    const tenant = {
      id: 7, name: 'Acme', slug: 'acme', domain: null, ownerEmail: 'o@acme.test',
      subscriptionStatus: 'active', expiresAt: null, adminOverride: false,
      isInternal: false, isActive: true, planId: 1, plan: { name: 'Free' },
      createdAt: new Date('2026-01-01'),
    };
    const { qb } = makeTenantQb([tenant], 41);
    const { service } = makeService(qb, makeUserCountQb([{ tenantId: 7, count: '3' }]));

    const result = await service.listClients({ search: 'acme', page: 1, limit: 20 });

    expect(result).toEqual({
      data: [{
        id: 7, name: 'Acme', slug: 'acme', domain: null, ownerEmail: 'o@acme.test',
        subscriptionStatus: 'active', expiresAt: null, adminOverride: false,
        isInternal: false, isActive: true, planId: 1, planName: 'Free',
        userCount: 3, createdAt: tenant.createdAt,
      }],
      total: 41,
      page: 1,
      limit: 20,
      totalPages: 3,
    });
  });
});
