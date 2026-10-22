import { ConflictException, NotFoundException } from '@nestjs/common';
import { BuyerService } from './buyer.service';

// Minimal chainable query builder: every call returns itself, terminal
// calls resolve to the configured result.
function qb(result: { one?: unknown; many?: unknown[]; count?: number } = {}) {
  const q: Record<string, jest.Mock> = {};
  const self = () => q;
  for (const m of ['where', 'andWhere', 'orWhere', 'leftJoin', 'leftJoinAndSelect', 'innerJoin', 'addSelect', 'select',
    'orderBy', 'addOrderBy', 'skip', 'take', 'setParameters', 'setParameter']) q[m] = jest.fn(self);
  q.getOne = jest.fn(async () => result.one ?? null);
  q.getMany = jest.fn(async () => result.many ?? []);
  q.getManyAndCount = jest.fn(async () => [result.many ?? [], result.count ?? 0]);
  q.getRawMany = jest.fn(async () => []);
  return q;
}

const admin = { id: 1, role: 'admin' };

function build(overrides: { existing?: unknown; lead?: unknown; stage?: unknown } = {}) {
  const leads = {
    createQueryBuilder: jest.fn(() => qb({ one: overrides.existing ?? overrides.lead ?? null })),
    findOne: jest.fn(async () => overrides.lead ?? null),
    update: jest.fn(async () => ({ affected: 1 })),
    save: jest.fn(async (x) => ({ id: 99, ...x })),
    create: jest.fn((x) => x),
    find: jest.fn(async () => []),
  };
  const activities = { create: jest.fn((x) => x), save: jest.fn(async (x) => ({ id: 5, ...x })), find: jest.fn(async () => []), createQueryBuilder: jest.fn(() => qb()) };
  const leadAgents = { delete: jest.fn(), insert: jest.fn(), find: jest.fn(async () => []) };
  const users = { find: jest.fn(async () => []), count: jest.fn(async () => 1) };
  const contacts = { findOrCreate: jest.fn(async () => ({ id: 3, email: 'a@b.c' })) };
  const stages = {
    defaultStageId: jest.fn(async () => 10),
    get: jest.fn(async (_t: number, id: number) => {
      if (!overrides.stage || (overrides.stage as { id: number }).id !== id) throw new NotFoundException();
      return overrides.stage;
    }),
  };
  const settings = { get: jest.fn(async () => ({ agentsSeeAll: false, staleDays: 14 })) };
  const service = new BuyerService(
    leads as never, activities as never, leadAgents as never, users as never,
    contacts as never, stages as never, settings as never, {} as never, { record: jest.fn(async () => undefined) } as never, { scores: jest.fn(async () => new Map()), hotIds: jest.fn(async () => new Set()) } as never,
  );
  return { service, leads, activities, leadAgents, contacts };
}

describe('BuyerService', () => {
  it('refuses a second buyer with the same email and names the existing one', async () => {
    const { service } = build({ existing: { id: 42 } });
    await expect(service.create(2, admin, { email: 'a@b.c' })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.create(2, admin, { email: 'a@b.c' })).rejects.toMatchObject({
      response: { code: 'BUYER_EXISTS', details: { id: 42 } },
    });
  });

  it('creates a buyer in the first stage, assigned to the creator', async () => {
    const { service, leads } = build();
    jest.spyOn(service, 'get').mockResolvedValue({ id: 99 } as never);
    await service.create(2, { id: 8, role: 'user' }, { email: 'new@b.c', firstName: 'Ana' });
    expect(leads.save).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 2, contactId: 3, stageId: 10, assignedTo: 8, firstName: 'Ana', role: 'buyer' }),
    );
  });

  it('updates only the keys that were sent, never save() on a loaded row', async () => {
    const lead = { id: 7, tenantId: 2, contactId: 3, assignedTo: 1, contact: { email: 'a@b.c' } };
    const { service, leads } = build({ lead });
    jest.spyOn(service, 'get').mockResolvedValue(lead as never);
    await service.update(2, admin, 7, { priority: 2, city: null });
    expect(leads.update).toHaveBeenCalledWith({ id: 7, tenantId: 2 }, expect.objectContaining({ priority: 2, city: null }));
    const patch = (leads.update.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(Object.keys(patch).sort()).toEqual(['city', 'lastActivityAt', 'priority']);
    expect(leads.save).not.toHaveBeenCalled();
  });

  it('moving to a won stage sets status won and wonAt', async () => {
    const lead = { id: 7, tenantId: 2, status: 'contacted', stageId: 10 };
    const { service, leads } = build({ lead, stage: { id: 17, kind: 'won', name: { en: 'Won' } } });
    jest.spyOn(service, 'get').mockResolvedValue(lead as never);
    await service.setStage(2, admin, 7, 17);
    expect(leads.update).toHaveBeenCalledWith(
      { id: 7, tenantId: 2 },
      expect.objectContaining({ stageId: 17, status: 'won', wonAt: expect.any(Date) }),
    );
  });

  it("rejects another tenant's stage", async () => {
    const lead = { id: 7, tenantId: 2, status: 'new', stageId: 10 };
    const { service, leads } = build({ lead, stage: { id: 17, kind: 'open' } });
    jest.spyOn(service, 'get').mockResolvedValue(lead as never);
    await expect(service.setStage(2, admin, 7, 999)).rejects.toBeInstanceOf(NotFoundException);
    expect(leads.update).not.toHaveBeenCalled();
  });
});
