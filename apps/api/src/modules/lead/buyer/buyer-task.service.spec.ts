import { NotFoundException } from '@nestjs/common';
import { BuyerTaskService } from './buyer-task.service';

function qb(one: unknown) {
  const q: Record<string, jest.Mock> = {};
  for (const m of ['leftJoin', 'innerJoin', 'addSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'take']) q[m] = jest.fn(() => q);
  q.getOne = jest.fn(async () => one);
  q.getMany = jest.fn(async () => []);
  return q;
}

const admin = { id: 1, role: 'admin' };

function build(task: unknown, visible = true) {
  const taskRepo = { createQueryBuilder: jest.fn(() => qb(task)), update: jest.fn(), delete: jest.fn(), save: jest.fn(), create: jest.fn((x) => x) };
  const buyers = {
    get: jest.fn(async () => {
      if (!visible) throw new NotFoundException('Buyer not found');
      return { id: 5, assignedTo: 7 };
    }),
    log: jest.fn(),
    assertAgents: jest.fn(),
  };
  const settings = { get: jest.fn(async () => ({ agentsSeeAll: false })) };
  return { service: new BuyerTaskService(taskRepo as never, buyers as never, settings as never), taskRepo, buyers };
}

describe('BuyerTaskService', () => {
  it('ticking a task done stamps doneAt and logs task_done', async () => {
    const { service, taskRepo, buyers } = build({ id: 3, leadId: 5, title: 'Call back', doneAt: null });
    await service.update(2, admin, 3, { done: true });
    expect(taskRepo.update).toHaveBeenCalledWith({ id: 3, tenantId: 2 }, { doneAt: expect.any(Date) });
    expect(buyers.log).toHaveBeenCalledWith(5, 1, 'task_done', 'Call back', { taskId: 3 });
  });

  it('un-ticking clears doneAt without an activity', async () => {
    const { service, taskRepo, buyers } = build({ id: 3, leadId: 5, title: 'x', doneAt: new Date() });
    await service.update(2, admin, 3, { done: false });
    expect(taskRepo.update).toHaveBeenCalledWith({ id: 3, tenantId: 2 }, { doneAt: null });
    expect(buyers.log).not.toHaveBeenCalled();
  });

  it("is 404 for another tenant's task", async () => {
    const { service } = build(null);
    await expect(service.update(2, admin, 3, { title: 'y' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("is 404 when the viewer can't see the buyer", async () => {
    const { service, taskRepo } = build({ id: 3, leadId: 5, title: 'x', doneAt: null }, false);
    await expect(service.remove(2, { id: 8, role: 'user' }, 3)).rejects.toMatchObject({ message: 'Task not found' });
    expect(taskRepo.delete).not.toHaveBeenCalled();
  });
});
