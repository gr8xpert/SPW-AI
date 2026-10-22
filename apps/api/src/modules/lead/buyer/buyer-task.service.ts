import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BuyerTask } from '../../../database/entities';
import { BuyerService } from './buyer.service';
import { BuyerSettingsService } from './buyer-settings.service';
import { applyVisibility, BuyerViewer, seesAllBuyers } from './buyer-access';
import { CreateTaskDto, DueTasksDto, UpdateTaskDto } from './dto/buyer-follow-up.dto';

const USER_FIELDS = (alias: string) => [`${alias}.id`, `${alias}.name`, `${alias}.email`];

// Follow-up tasks on buyers. A task is visible to whoever can see its buyer.
@Injectable()
export class BuyerTaskService {
  constructor(
    @InjectRepository(BuyerTask)
    private readonly taskRepository: Repository<BuyerTask>,
    private readonly buyers: BuyerService,
    private readonly settings: BuyerSettingsService,
  ) {}

  // Open tasks first (soonest due first, undated last), then done ones.
  async listForBuyer(tenantId: number, viewer: BuyerViewer, leadId: number): Promise<BuyerTask[]> {
    await this.buyers.get(tenantId, viewer, leadId);
    return this.taskRepository
      .createQueryBuilder('t')
      .leftJoin('t.assignedToUser', 'assignee')
      .addSelect(USER_FIELDS('assignee'))
      .where('t.tenantId = :tenantId AND t.leadId = :leadId', { tenantId, leadId })
      .orderBy('t.doneAt IS NULL', 'DESC')
      .addOrderBy('t.dueAt IS NULL', 'ASC')
      .addOrderBy('t.dueAt', 'ASC')
      .addOrderBy('t.doneAt', 'DESC')
      .addOrderBy('t.id', 'ASC')
      .getMany();
  }

  async create(tenantId: number, viewer: BuyerViewer, leadId: number, dto: CreateTaskDto): Promise<BuyerTask> {
    const lead = await this.buyers.get(tenantId, viewer, leadId);
    // Who does it: as chosen, else the buyer's agent, else the creator.
    const assignedTo = dto.assignedTo !== undefined ? dto.assignedTo : lead.assignedTo ?? viewer.id;
    if (assignedTo) await this.buyers.assertAgents(tenantId, [assignedTo]);
    const saved = await this.taskRepository.save(
      this.taskRepository.create({
        tenantId,
        leadId: lead.id,
        title: dto.title,
        notes: dto.notes || null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        assignedTo,
        createdBy: viewer.id,
      }),
    );
    return this.get(tenantId, viewer, saved.id);
  }

  async update(tenantId: number, viewer: BuyerViewer, taskId: number, dto: UpdateTaskDto): Promise<BuyerTask> {
    const task = await this.get(tenantId, viewer, taskId);
    const patch: Partial<BuyerTask> = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.notes !== undefined) patch.notes = dto.notes?.trim() || null;
    if (dto.dueAt !== undefined) patch.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (dto.assignedTo !== undefined) {
      if (dto.assignedTo !== null) await this.buyers.assertAgents(tenantId, [dto.assignedTo]);
      patch.assignedTo = dto.assignedTo;
    }
    if (dto.done !== undefined && dto.done !== !!task.doneAt) {
      patch.doneAt = dto.done ? new Date() : null;
      if (dto.done) await this.buyers.log(task.leadId, viewer.id, 'task_done', dto.title ?? task.title, { taskId: task.id });
    }
    if (Object.keys(patch).length) await this.taskRepository.update({ id: task.id, tenantId }, patch);
    return this.get(tenantId, viewer, task.id);
  }

  async remove(tenantId: number, viewer: BuyerViewer, taskId: number): Promise<void> {
    const task = await this.get(tenantId, viewer, taskId);
    await this.taskRepository.delete({ id: task.id, tenantId });
  }

  // "To do today": open tasks of one agent due before `before` (the end of
  // the viewer's day), oldest first. Agents get their own; owners and
  // managers may look at another agent's list.
  async due(tenantId: number, viewer: BuyerViewer, dto: DueTasksDto): Promise<BuyerTask[]> {
    const settings = await this.settings.get(tenantId);
    const agentId = dto.agentId && seesAllBuyers(viewer, false) ? dto.agentId : viewer.id;
    const qb = this.taskRepository
      .createQueryBuilder('t')
      .innerJoin('t.lead', 'lead')
      .addSelect(['lead.id', 'lead.firstName', 'lead.lastName', 'lead.phone', 'lead.mobile'])
      .leftJoin('lead.contact', 'contact')
      .addSelect(['contact.id', 'contact.email'])
      .leftJoin('t.assignedToUser', 'assignee')
      .addSelect(USER_FIELDS('assignee'))
      .where('t.tenantId = :tenantId', { tenantId })
      .andWhere('t.assignedTo = :agentId', { agentId })
      .andWhere('t.doneAt IS NULL')
      .andWhere('t.dueAt IS NOT NULL AND t.dueAt < :before', { before: new Date(dto.before) })
      .andWhere('lead.mergedIntoId IS NULL');
    applyVisibility(qb, viewer, settings.agentsSeeAll, 'lead');
    return qb.orderBy('t.dueAt', 'ASC').addOrderBy('t.id', 'ASC').take(500).getMany();
  }

  // A task of this tenant whose buyer the viewer can see (404 otherwise).
  private async get(tenantId: number, viewer: BuyerViewer, taskId: number): Promise<BuyerTask> {
    const task = await this.taskRepository
      .createQueryBuilder('t')
      .leftJoin('t.assignedToUser', 'assignee')
      .addSelect(USER_FIELDS('assignee'))
      .where('t.id = :taskId AND t.tenantId = :tenantId', { taskId, tenantId })
      .getOne();
    if (!task) throw new NotFoundException('Task not found');
    await this.buyers.get(tenantId, viewer, task.leadId).catch(() => {
      throw new NotFoundException('Task not found');
    });
    return task;
  }
}
