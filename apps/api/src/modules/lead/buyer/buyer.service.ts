import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { BuyerStage, Lead, LeadActivity, LeadActivityType, LeadAgent, User } from '../../../database/entities';
import { ContactService } from '../../contact/contact.service';
import { BuyerStageService } from './buyer-stage.service';
import { BuyerSettingsService } from './buyer-settings.service';
import { BuyerQuestionService } from './buyer-question.service';
import { applyVisibility, BuyerViewer } from './buyer-access';
import { stageKindToStatus } from './buyer-defaults';
import { cleanWishlist, isEmptyWishlist } from './buyer-match';
import { rulesHash } from './ai/note-rules';
import { BuyerChangeLogService } from './buyer-change-log.service';
import { BuyerHotService } from './buyer-hot.service';
import { answerChanges, diffFields, sameValue, wishlistChanges, type FieldChange } from './change-log';
import type { WishlistDto } from './dto/buyer-match.dto';

import { BuyerActivityDto, CreateBuyerDto, ListBuyersDto, UpdateBuyerDto } from './dto/buyer.dto';

// Columns an agent edits on the record; copied 1:1 from UpdateBuyerDto.
const PLAIN_FIELDS = [
  'firstName', 'lastName', 'phone', 'mobile', 'role', 'language', 'preferredContact', 'photoUrl',
  'street', 'street2', 'city', 'zip', 'state', 'country', 'idType', 'idNumber', 'lawyer',
  'subStatus', 'priority', 'dealValue', 'waitingReplyAt', 'referredBy', 'referralPercent',
  'visitStart', 'visitEnd', 'notes', 'relatedContacts',
] as const;

// Activity types that count as having been in touch with the buyer.
const CONTACT_TYPES: LeadActivityType[] = ['call', 'email', 'sms', 'viewing', 'meeting'];

const BOARD_COLUMN = 100;

const AGENT_FIELDS = (alias: string) => [`${alias}.id`, `${alias}.name`, `${alias}.email`, `${alias}.avatarUrl`];

export interface BuyerActivityItem {
  id: number | string;
  type: LeadActivityType;
  description: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  user: { id: number; name: string | null } | null;
  // Set when the entry belongs to an older lead merged into this buyer.
  fromLeadId?: number;
}

// An erased buyer (GDPR, milestone J) can be looked at, not edited.
export function assertNotErased(lead: { erasedAt?: Date | null }): void {
  if (lead.erasedAt) throw new ForbiddenException({ code: 'ERASED', message: "This buyer's details were erased" });
}

@Injectable()
export class BuyerService {
  constructor(
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(LeadActivity)
    private readonly activityRepository: Repository<LeadActivity>,
    @InjectRepository(LeadAgent)
    private readonly leadAgentRepository: Repository<LeadAgent>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly contactService: ContactService,
    private readonly stageService: BuyerStageService,
    private readonly settingsService: BuyerSettingsService,
    private readonly questionService: BuyerQuestionService,
    private readonly changeLog: BuyerChangeLogService,
    private readonly hot: BuyerHotService,
  ) {}

  // Every buyer query starts here: this tenant, not merged away, visible to
  // the viewer.
  private async visible(tenantId: number, viewer: BuyerViewer): Promise<SelectQueryBuilder<Lead>> {
    const settings = await this.settingsService.get(tenantId);
    const qb = this.leadRepository
      .createQueryBuilder('lead')
      .where('lead.tenantId = :tenantId', { tenantId })
      .andWhere('lead.mergedIntoId IS NULL');
    applyVisibility(qb, viewer, settings.agentsSeeAll);
    return qb;
  }

  // The list's joins and filters; the board uses the same ones.
  async filtered(tenantId: number, viewer: BuyerViewer, dto: ListBuyersDto): Promise<SelectQueryBuilder<Lead>> {
    const settings = await this.settingsService.get(tenantId);
    const qb = (await this.visible(tenantId, viewer))
      .leftJoin('lead.contact', 'contact')
      .addSelect(['contact.id', 'contact.email'])
      .leftJoin('lead.assignedToUser', 'agent')
      .addSelect(AGENT_FIELDS('agent'))
      .leftJoinAndSelect('lead.stage', 'stage')
      // Erased buyers keep an anonymous row for Reports only; they leave the
      // list, the board and the export.
      .andWhere('lead.erasedAt IS NULL');

    if (dto.q) {
      qb.andWhere(
        '(contact.email LIKE :q OR lead.firstName LIKE :q OR lead.lastName LIKE :q OR CONCAT_WS(\' \', lead.firstName, lead.lastName) LIKE :q OR lead.phone LIKE :q OR lead.mobile LIKE :q)',
        { q: `%${dto.q.replace(/[%_]/g, '\\$&')}%` },
      );
    }
    if (dto.role) qb.andWhere('lead.role = :role', { role: dto.role });
    if (dto.agentId) {
      qb.andWhere(
        '(lead.assignedTo = :agentId OR EXISTS (SELECT 1 FROM lead_agents fa WHERE fa.leadId = lead.id AND fa.userId = :agentId))',
        { agentId: dto.agentId },
      );
    }
    if (dto.stageId) qb.andWhere('lead.stageId = :stageId', { stageId: dto.stageId });
    if (dto.priority !== undefined) qb.andWhere('lead.priority = :priority', { priority: dto.priority });
    if (dto.source) qb.andWhere('lead.source = :source', { source: dto.source });
    if (dto.locationId) {
      qb.andWhere("JSON_CONTAINS(JSON_EXTRACT(lead.wishlist, '$.locationIds'), CAST(:loc AS JSON))", { loc: String(dto.locationId) });
    }
    // Budget filter: the buyer's budget range overlaps the one asked for.
    if (dto.budgetMin !== undefined) {
      qb.andWhere("COALESCE(JSON_EXTRACT(lead.wishlist, '$.budgetMax'), 1e15) >= :bMin", { bMin: dto.budgetMin });
    }
    if (dto.budgetMax !== undefined) {
      qb.andWhere("COALESCE(JSON_EXTRACT(lead.wishlist, '$.budgetMin'), 0) <= :bMax", { bMax: dto.budgetMax });
    }
    if (dto.hot) {
      const hot = [...(await this.hot.hotIds(tenantId, settings.hotScore))];
      if (hot.length) qb.andWhere('lead.id IN (:...hotIds)', { hotIds: hot });
      else qb.andWhere('1 = 0');
    }
    if (dto.stale) {
      qb.andWhere('(stage.kind IS NULL OR stage.kind = :open)', { open: 'open' }).andWhere(
        'COALESCE(lead.lastActivityAt, lead.updatedAt) < :staleBefore',
        { staleBefore: new Date(Date.now() - settings.staleDays * 86_400_000) },
      );
    }
    // answer=questionKey:optionKey (both [a-z0-9_], checked by the DTO, so
    // the key is safe inside the JSON path).
    if (dto.answer) {
      const [key, option] = dto.answer.split(':');
      qb.andWhere(`JSON_CONTAINS(JSON_EXTRACT(lead.answers, '$."${key}"'), JSON_QUOTE(:answerOption))`, { answerOption: option });
    }
    return qb;
  }

  async list(tenantId: number, viewer: BuyerViewer, dto: ListBuyersDto): Promise<{ data: Lead[]; total: number; page: number; limit: number }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 24;
    const qb = await this.filtered(tenantId, viewer, dto);

    switch (dto.sort) {
      case 'created':
        qb.orderBy('lead.createdAt', 'DESC');
        break;
      case 'name':
        qb.orderBy('lead.firstName', 'ASC').addOrderBy('lead.lastName', 'ASC');
        break;
      case 'priority':
        qb.orderBy('lead.priority', 'DESC').addOrderBy('lead.lastActivityAt', 'DESC');
        break;
      default:
        qb.orderBy('lead.lastActivityAt', 'DESC');
    }
    qb.addOrderBy('lead.id', 'DESC');

    const [data, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    // Hot badge for the buyers on this page.
    const { hotScore } = await this.settingsService.get(tenantId);
    const scores = await this.hot.scores(tenantId, data.map((l) => l.id));
    for (const l of data) Object.assign(l, { hot: (scores.get(l.id) ?? 0) >= hotScore && (scores.get(l.id) ?? 0) > 0 });
    return { data, total, page, limit };
  }

  async get(tenantId: number, viewer: BuyerViewer, id: number): Promise<Lead & { mergedIds: number[]; rulesStale: boolean }> {
    const lead = await (await this.visible(tenantId, viewer))
      .andWhere('lead.id = :id', { id })
      .leftJoinAndSelect('lead.contact', 'contact')
      .leftJoin('lead.assignedToUser', 'agent')
      .addSelect(AGENT_FIELDS('agent'))
      .leftJoinAndSelect('lead.stage', 'stage')
      .leftJoinAndSelect('lead.agents', 'related')
      .leftJoin('related.user', 'relatedUser')
      .addSelect(AGENT_FIELDS('relatedUser'))
      .leftJoin('lead.property', 'property')
      .addSelect(['property.id', 'property.reference', 'property.title'])
      .getOne();
    if (!lead) throw new NotFoundException('Buyer not found');
    const merged = await this.leadRepository.find({ where: { tenantId, mergedIntoId: id }, select: ['id'] });
    // The notes changed since the rules were read from them.
    const rulesStale = !!lead.noteRulesHash && rulesHash(lead.notes) !== lead.noteRulesHash;
    return Object.assign(lead, { mergedIds: merged.map((m) => m.id), rulesStale });
  }

  async create(tenantId: number, viewer: BuyerViewer, dto: CreateBuyerDto): Promise<Lead> {
    const existing = await this.leadRepository
      .createQueryBuilder('lead')
      .innerJoin('lead.contact', 'contact')
      .where('lead.tenantId = :tenantId', { tenantId })
      .andWhere('lead.mergedIntoId IS NULL')
      .andWhere('contact.email = :email', { email: dto.email })
      .getOne();
    if (existing) {
      throw new ConflictException({ code: 'BUYER_EXISTS', details: { id: existing.id }, message: 'A buyer with this email already exists' });
    }

    if (dto.assignedTo) await this.assertAgents(tenantId, [dto.assignedTo]);
    const name = [dto.firstName, dto.lastName].filter(Boolean).join(' ') || undefined;
    const contact = await this.contactService.findOrCreate(tenantId, {
      email: dto.email,
      name,
      phone: dto.phone,
      source: 'manual',
    });

    const saved = await this.leadRepository.save(
      this.leadRepository.create({
        tenantId,
        contactId: contact.id,
        source: dto.source ?? 'other',
        status: 'new',
        role: dto.role ?? 'buyer',
        stageId: await this.stageService.defaultStageId(tenantId),
        assignedTo: dto.assignedTo ?? viewer.id,
        firstName: dto.firstName ?? null,
        lastName: dto.lastName ?? null,
        phone: dto.phone ?? null,
        mobile: dto.mobile ?? null,
        language: dto.language ?? null,
        notes: dto.notes ?? null,
        lastActivityAt: new Date(),
      }),
    );
    await this.changeLog.record(tenantId, saved.id, viewer.id, 'dashboard', [{ field: 'created', from: null, to: 'dashboard' }]);
    return this.get(tenantId, viewer, saved.id);
  }

  async update(tenantId: number, viewer: BuyerViewer, id: number, dto: UpdateBuyerDto): Promise<Lead> {
    const lead = await this.get(tenantId, viewer, id);
    assertNotErased(lead);
    // Never save() the loaded row: its loaded relations would win over the
    // new *Id values (TypeORM). Only the keys sent are written.
    const patch: Partial<Lead> = {};
    for (const key of PLAIN_FIELDS) {
      if (dto[key] !== undefined) (patch as Record<string, unknown>)[key] = dto[key];
    }

    if (dto.email !== undefined && dto.email !== lead.contact?.email) {
      const clash = await this.leadRepository
        .createQueryBuilder('lead')
        .innerJoin('lead.contact', 'contact')
        .where('lead.tenantId = :tenantId', { tenantId })
        .andWhere('lead.mergedIntoId IS NULL')
        .andWhere('lead.id <> :id', { id })
        .andWhere('contact.email = :email', { email: dto.email })
        .getOne();
      if (clash) throw new ConflictException({ code: 'BUYER_EXISTS', details: { id: clash.id }, message: 'A buyer with this email already exists' });
      const contact = await this.contactService.findOrCreate(tenantId, { email: dto.email, source: 'manual' });
      patch.contactId = contact.id;
    }

    if (dto.assignedTo !== undefined && dto.assignedTo !== lead.assignedTo) {
      if (dto.assignedTo !== null) await this.assertAgents(tenantId, [dto.assignedTo]);
      patch.assignedTo = dto.assignedTo;
      await this.log(lead.id, viewer.id, 'assignment', null, { from: lead.assignedTo, to: dto.assignedTo });
    }

    const changes: FieldChange[] = diffFields(lead as unknown as Record<string, unknown>, patch as Record<string, unknown>, [...PLAIN_FIELDS, 'assignedTo']);
    if (patch.contactId !== undefined) changes.push({ field: 'email', from: lead.contact?.email ?? null, to: dto.email });

    if (dto.agentIds !== undefined) {
      const mainAgent = patch.assignedTo !== undefined ? patch.assignedTo : lead.assignedTo;
      const ids = [...new Set(dto.agentIds)].filter((u) => u !== mainAgent);
      if (ids.length) await this.assertAgents(tenantId, ids);
      const before = (lead.agents || []).map((a) => a.userId);
      if (!sameValue(before, ids)) changes.push({ field: 'agentIds', from: before, to: ids });
      await this.leadAgentRepository.delete({ leadId: lead.id });
      if (ids.length) await this.leadAgentRepository.insert(ids.map((userId) => ({ leadId: lead.id, userId })));
    }

    patch.lastActivityAt = new Date();
    await this.leadRepository.update({ id: lead.id, tenantId }, patch);
    await this.changeLog.record(tenantId, lead.id, viewer.id, 'dashboard', changes);
    return this.get(tenantId, viewer, id);
  }

  async setStage(tenantId: number, viewer: BuyerViewer, id: number, stageId: number): Promise<Lead> {
    const lead = await this.get(tenantId, viewer, id);
    const stage = await this.stageService.get(tenantId, stageId);
    if (lead.stageId === stage.id) return lead;
    const status = stageKindToStatus(stage.kind, lead.status);
    const patch: Partial<Lead> = { stageId: stage.id, status, lastActivityAt: new Date() };
    if (status === 'won' && lead.status !== 'won') patch.wonAt = new Date();
    if (status === 'lost' && lead.status !== 'lost') patch.lostAt = new Date();
    await this.leadRepository.update({ id: lead.id, tenantId }, patch);
    await this.log(lead.id, viewer.id, 'status_change', null, { fromStageId: lead.stageId, toStageId: stage.id });
    await this.changeLog.record(tenantId, lead.id, viewer.id, 'dashboard', [{ field: 'stageId', from: lead.stageId, to: stage.id }]);
    return this.get(tenantId, viewer, id);
  }

  // The pipeline board: every stage with its buyers (same filters as the
  // list), newest activity first. Each column shows at most BOARD_COLUMN
  // cards; total is the real count. Buyers without a stage sit in the first.
  async board(
    tenantId: number,
    viewer: BuyerViewer,
    dto: ListBuyersDto,
  ): Promise<{ stages: BuyerStage[]; columns: Record<number, { total: number; data: Lead[] }> }> {
    const stages = await this.stageService.list(tenantId);
    const { stageId: _ignored, ...filters } = dto;
    const counts = await (await this.filtered(tenantId, viewer, filters))
      .select('lead.stageId', 'stageId')
      .addSelect('COUNT(*)', 'n')
      .groupBy('lead.stageId')
      .getRawMany<{ stageId: number | null; n: string }>();
    const first = stages[0]?.id ?? null;
    const columns: Record<number, { total: number; data: Lead[] }> = {};
    for (const s of stages) columns[s.id] = { total: 0, data: [] };
    for (const c of counts) {
      const id = c.stageId != null && columns[c.stageId] ? c.stageId : first;
      if (id != null) columns[id].total += Number(c.n);
    }
    for (const s of stages) {
      const qb = await this.filtered(tenantId, viewer, filters);
      if (s.id === first) qb.andWhere('(lead.stageId = :sid OR lead.stageId IS NULL)', { sid: s.id });
      else qb.andWhere('lead.stageId = :sid', { sid: s.id });
      columns[s.id].data = await qb.orderBy('lead.lastActivityAt', 'DESC').addOrderBy('lead.id', 'DESC').take(BOARD_COLUMN).getMany();
    }
    return { stages, columns };
  }

  async setAnswers(tenantId: number, viewer: BuyerViewer, id: number, raw: Record<string, unknown>): Promise<Lead> {
    const lead = await this.get(tenantId, viewer, id);
    assertNotErased(lead);
    const answers = await this.questionService.clean(tenantId, raw);
    await this.leadRepository.update(
      { id: lead.id, tenantId },
      { answers: Object.keys(answers).length ? answers : null, lastActivityAt: new Date() },
    );
    await this.changeLog.record(tenantId, lead.id, viewer.id, 'dashboard', answerChanges(lead.answers, answers));
    return this.get(tenantId, viewer, id);
  }

  // The agent's edit replaces the whole wishlist and is never 'guessed'
  // again (a website enquiry won't overwrite it).
  async setWishlist(tenantId: number, viewer: BuyerViewer, id: number, dto: WishlistDto): Promise<Lead> {
    const lead = await this.get(tenantId, viewer, id);
    assertNotErased(lead);
    const pairs: [keyof WishlistDto, keyof WishlistDto][] = [
      ['budgetMin', 'budgetMax'], ['minBuildSize', 'maxBuildSize'], ['minPlotSize', 'maxPlotSize'],
    ];
    for (const [lo, hi] of pairs) {
      const a = dto[lo] as number | undefined;
      const b = dto[hi] as number | undefined;
      if (a && b && a > b) throw new BadRequestException({ code: 'BAD_RANGE', details: { field: lo }, message: `${lo} is above ${hi}` });
    }
    const wishlist = cleanWishlist({ ...dto, guessed: false });
    const empty = isEmptyWishlist(wishlist) && !wishlist.sendMatchesTo;
    await this.leadRepository.update({ id: lead.id, tenantId }, { wishlist: empty ? null : wishlist, lastActivityAt: new Date() });
    await this.changeLog.record(tenantId, lead.id, viewer.id, 'dashboard', wishlistChanges(lead.wishlist, empty ? null : wishlist));
    return this.get(tenantId, viewer, id);
  }

  // People a buyer can be given to: active logins with "Works with buyers"
  // on (Agents page). Not behind the Team add-on.
  async agents(tenantId: number): Promise<Pick<User, 'id' | 'name' | 'email' | 'role' | 'avatarUrl'>[]> {
    return this.userRepository.find({
      where: { tenantId, isActive: true, canLogin: true, worksBuyers: true, role: In(['admin', 'user']) },
      select: ['id', 'name', 'email', 'role', 'avatarUrl'],
      order: { name: 'ASC' },
    });
  }

  async activities(tenantId: number, viewer: BuyerViewer, id: number): Promise<BuyerActivityItem[]> {
    const lead = await this.get(tenantId, viewer, id);
    const leadIds = [lead.id, ...lead.mergedIds];
    const rows = await this.activityRepository
      .createQueryBuilder('a')
      .leftJoin('a.user', 'u')
      .addSelect(['u.id', 'u.name'])
      .where('a.leadId IN (:...leadIds)', { leadIds })
      .orderBy('a.createdAt', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .getMany();
    const items: BuyerActivityItem[] = rows.map((a) => ({
      id: a.id,
      type: a.type,
      description: a.description,
      metadata: a.metadata,
      createdAt: a.createdAt,
      user: a.user ? { id: a.user.id, name: a.user.name } : null,
      fromLeadId: a.leadId !== lead.id ? a.leadId : undefined,
    }));

    // An older enquiry merged into this buyer: its visitor message lived on
    // lead.notes (website leads had no activity rows), so show it as one.
    if (lead.mergedIds.length) {
      const merged = await this.leadRepository.find({
        where: { tenantId, id: In(lead.mergedIds) },
        select: ['id', 'notes', 'createdAt', 'propertyId', 'source'],
      });
      for (const m of merged) {
        items.push({
          id: `lead-${m.id}`,
          type: 'enquiry',
          description: m.notes,
          metadata: { propertyId: m.propertyId, source: m.source },
          createdAt: m.createdAt,
          user: null,
          fromLeadId: m.id,
        });
      }
      items.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    }
    return items;
  }

  async addActivity(tenantId: number, viewer: BuyerViewer, id: number, dto: BuyerActivityDto): Promise<LeadActivity> {
    const lead = await this.get(tenantId, viewer, id);
    return this.log(lead.id, viewer.id, dto.type, dto.description, dto.via ? { via: dto.via } : null, CONTACT_TYPES.includes(dto.type));
  }

  // Writes an activity and marks the buyer as touched. userId null = the
  // website or the system.
  async log(
    leadId: number,
    userId: number | null,
    type: LeadActivityType,
    description: string | null,
    metadata: Record<string, unknown> | null,
    contacted = false,
  ): Promise<LeadActivity> {
    const activity = await this.activityRepository.save(
      this.activityRepository.create({ leadId, userId, type, description, metadata }),
    );
    const now = new Date();
    await this.leadRepository.update(leadId, contacted ? { lastActivityAt: now, lastContactAt: now } : { lastActivityAt: now });
    return activity;
  }

  async assertAgents(tenantId: number, userIds: number[]): Promise<void> {
    const found = await this.userRepository.count({ where: { tenantId, id: In(userIds), isActive: true } });
    if (found !== new Set(userIds).size) throw new BadRequestException('Unknown agent');
  }
}
