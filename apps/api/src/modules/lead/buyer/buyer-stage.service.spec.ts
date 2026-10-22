import { BadRequestException } from '@nestjs/common';
import { BuyerStageService } from './buyer-stage.service';

const STAGES = [
  { id: 1, tenantId: 2, kind: 'open', sortOrder: 0, name: { en: 'New' } },
  { id: 2, tenantId: 2, kind: 'open', sortOrder: 1, name: { en: 'Viewing' } },
  { id: 3, tenantId: 2, kind: 'won', sortOrder: 2, name: { en: 'Won' } },
];

function build(stages = STAGES, inStage = 0) {
  const updateQb: Record<string, jest.Mock> = { execute: jest.fn() };
  for (const m of ['update', 'set', 'where']) updateQb[m] = jest.fn(() => updateQb);
  const stageRepo = {
    find: jest.fn(async () => stages),
    findOne: jest.fn(async ({ where }: { where: { id: number; tenantId: number } }) =>
      stages.find((s) => s.id === where.id && s.tenantId === where.tenantId) ?? null),
    update: jest.fn(),
    delete: jest.fn(),
    insert: jest.fn(),
    save: jest.fn(async (x) => ({ id: 9, ...x })),
    create: jest.fn((x) => x),
  };
  const leadRepo = { count: jest.fn(async () => inStage), find: jest.fn(async () => []), createQueryBuilder: jest.fn(() => updateQb) };
  return { service: new BuyerStageService(stageRepo as never, leadRepo as never), stageRepo, leadRepo, updateQb };
}

describe('BuyerStageService', () => {
  it('refuses to delete a stage that still has buyers without a target', async () => {
    const { service, stageRepo } = build(STAGES, 3);
    await expect(service.remove(2, 2)).rejects.toMatchObject({ response: { code: 'STAGE_NOT_EMPTY', details: { count: 3 } } });
    expect(stageRepo.delete).not.toHaveBeenCalled();
  });

  it('moves the buyers, then deletes', async () => {
    const { service, stageRepo, updateQb } = build(STAGES, 3);
    await service.remove(2, 2, 1);
    expect(updateQb.set).toHaveBeenCalledWith(expect.objectContaining({ stageId: 1 }));
    expect(stageRepo.delete).toHaveBeenCalledWith({ id: 2, tenantId: 2 });
  });

  it('keeps at least one open stage', async () => {
    const one = [STAGES[0], STAGES[2]];
    const { service } = build(one);
    await expect(service.remove(2, 1)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update(2, 1, { kind: 'lost' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reorder needs every stage of the tenant exactly once', async () => {
    const { service, stageRepo } = build();
    await expect(service.reorder(2, [1, 2])).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.reorder(2, [1, 2, 99])).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.reorder(2, [1, 1, 3])).rejects.toBeInstanceOf(BadRequestException);
    await service.reorder(2, [3, 1, 2]);
    expect(stageRepo.update).toHaveBeenCalledWith({ id: 3, tenantId: 2 }, { sortOrder: 0 });
  });

  it('rejects a stage without any name', async () => {
    const { service } = build();
    await expect(service.create(2, { name: { en: '  ' } })).rejects.toBeInstanceOf(BadRequestException);
  });
});
