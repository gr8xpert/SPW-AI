import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BuyerStage, Lead } from '../../../database/entities';
import { DEFAULT_STAGES, stageKindToStatus } from './buyer-defaults';
import { cleanTranslations } from './translations';
import { CreateStageDto, UpdateStageDto } from './dto/buyer-follow-up.dto';

@Injectable()
export class BuyerStageService {
  constructor(
    @InjectRepository(BuyerStage)
    private readonly stageRepository: Repository<BuyerStage>,
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
  ) {}

  // The tenant's stages in board order. A tenant created after the
  // BuyerMatchCore migration has none yet: it gets the defaults on first use.
  async list(tenantId: number): Promise<BuyerStage[]> {
    const stages = await this.stageRepository.find({ where: { tenantId }, order: { sortOrder: 'ASC', id: 'ASC' } });
    if (stages.length) return stages;
    await this.stageRepository.insert(
      DEFAULT_STAGES.map((s, i) => ({ tenantId, name: s.name, color: s.color, sortOrder: i, kind: s.kind })),
    );
    return this.stageRepository.find({ where: { tenantId }, order: { sortOrder: 'ASC', id: 'ASC' } });
  }

  // Where a new buyer starts: the first open stage.
  async defaultStageId(tenantId: number): Promise<number | null> {
    const stages = await this.list(tenantId);
    return (stages.find((s) => s.kind === 'open') ?? stages[0])?.id ?? null;
  }

  async get(tenantId: number, id: number): Promise<BuyerStage> {
    const stage = await this.stageRepository.findOne({ where: { id, tenantId } });
    if (!stage) throw new NotFoundException('Stage not found');
    return stage;
  }

  async create(tenantId: number, dto: CreateStageDto): Promise<BuyerStage> {
    const stages = await this.list(tenantId);
    if (stages.length >= 30) throw new BadRequestException('A pipeline can have at most 30 stages');
    // New open stages go before the first won/lost stage, others at the end.
    const kind = dto.kind ?? 'open';
    const firstClosed = stages.findIndex((s) => s.kind !== 'open');
    const at = kind === 'open' && firstClosed >= 0 ? firstClosed : stages.length;
    const ordered = [...stages];
    const saved = await this.stageRepository.save(
      this.stageRepository.create({
        tenantId,
        name: cleanTranslations(dto.name, 60, 'A stage'),
        color: dto.color ?? '#64748b',
        kind,
        sortOrder: 0,
      }),
    );
    ordered.splice(at, 0, saved);
    await this.writeOrder(tenantId, ordered.map((s) => s.id));
    return this.get(tenantId, saved.id);
  }

  async update(tenantId: number, id: number, dto: UpdateStageDto): Promise<BuyerStage> {
    const stage = await this.get(tenantId, id);
    const patch: Partial<BuyerStage> = {};
    if (dto.name !== undefined) patch.name = cleanTranslations(dto.name, 60, 'A stage');
    if (dto.color !== undefined) patch.color = dto.color;
    if (dto.probability !== undefined) patch.probability = dto.probability;
    if (dto.kind !== undefined && dto.kind !== stage.kind) {
      const stages = await this.list(tenantId);
      if (stage.kind === 'open' && stages.filter((s) => s.kind === 'open').length === 1) {
        throw new BadRequestException('The pipeline needs at least one open stage');
      }
      patch.kind = dto.kind;
    }
    if (Object.keys(patch).length) await this.stageRepository.update({ id, tenantId }, patch);

    // A changed kind changes what "won/lost" means for the buyers in it.
    if (patch.kind) await this.syncStatus(tenantId, id, patch.kind);
    return this.get(tenantId, id);
  }

  async reorder(tenantId: number, ids: number[]): Promise<BuyerStage[]> {
    const stages = await this.list(tenantId);
    const all = new Set(stages.map((s) => s.id));
    if (ids.length !== all.size || new Set(ids).size !== ids.length || ids.some((id) => !all.has(id))) {
      throw new BadRequestException('Send every stage of this pipeline exactly once');
    }
    await this.writeOrder(tenantId, ids);
    return this.list(tenantId);
  }

  // Buyers still in the stage move to `moveTo` first.
  async remove(tenantId: number, id: number, moveTo?: number): Promise<void> {
    const stage = await this.get(tenantId, id);
    const stages = await this.list(tenantId);
    if (stage.kind === 'open' && stages.filter((s) => s.kind === 'open').length === 1) {
      throw new BadRequestException('The pipeline needs at least one open stage');
    }
    const inStage = await this.leadRepository.count({ where: { tenantId, stageId: id } });
    if (inStage) {
      if (!moveTo || moveTo === id) {
        throw new BadRequestException({ code: 'STAGE_NOT_EMPTY', details: { count: inStage }, message: 'Choose a stage for the buyers in this stage' });
      }
      const target = await this.get(tenantId, moveTo);
      await this.leadRepository
        .createQueryBuilder()
        .update()
        .set({ stageId: target.id, updatedAt: () => 'updatedAt' } as never)
        .where('tenantId = :tenantId AND stageId = :id', { tenantId, id })
        .execute();
      await this.syncStatus(tenantId, target.id, target.kind);
    }
    await this.stageRepository.delete({ id, tenantId });
  }

  private async writeOrder(tenantId: number, ids: number[]): Promise<void> {
    for (const [i, id] of ids.entries()) await this.stageRepository.update({ id, tenantId }, { sortOrder: i });
  }

  // leads.status follows the stage kind (see stageKindToStatus).
  private async syncStatus(tenantId: number, stageId: number, kind: BuyerStage['kind']): Promise<void> {
    const leads = await this.leadRepository.find({ where: { tenantId, stageId }, select: ['id', 'status'] });
    const byStatus = new Map<string, number[]>();
    for (const l of leads) {
      const next = stageKindToStatus(kind, l.status);
      if (next !== l.status) byStatus.set(next, [...(byStatus.get(next) ?? []), l.id]);
    }
    for (const [status, ids] of byStatus) {
      await this.leadRepository
        .createQueryBuilder()
        .update()
        .set({ status, updatedAt: () => 'updatedAt' } as never)
        .where({ id: In(ids) })
        .execute();
    }
  }
}
