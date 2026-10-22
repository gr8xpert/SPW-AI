import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { SuggestionStatus } from '@spm/shared';
import { LeadSuggestion, Property } from '../../../database/entities';
import { BuyerService } from './buyer.service';
import type { BuyerViewer } from './buyer-access';
import { BuyerMatchService } from './buyer-match.service';
import type { BuyerPropertyCard } from './buyer-property-card';
import type { AddSuggestionsDto, UpdateSuggestionDto } from './dto/buyer-match.dto';

export interface SuggestionItem {
  id: number;
  propertyId: number;
  note: string | null;
  virtualTourUrl: string | null;
  visitDate: Date | null;
  status: SuggestionStatus;
  sentAt: Date | null;
  openedAt: Date | null;
  clickedAt: Date | null;
  likedAt: Date | null;
  rejectedAt: Date | null;
  rejectReason: string | null;
  viewingAt: Date | null;
  offerAt: Date | null;
  createdAt: Date;
  property: BuyerPropertyCard | null;
}

export type HiddenReason = 'sent' | 'rejected';

// Feedback the agent recorded is kept when the property is sent again.
const SENT_OVERWRITES: SuggestionStatus[] = ['suggested', 'sent'];

@Injectable()
export class BuyerSuggestionService {
  constructor(
    @InjectRepository(LeadSuggestion)
    private readonly suggestionRepository: Repository<LeadSuggestion>,
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    private readonly buyers: BuyerService,
    private readonly matchService: BuyerMatchService,
  ) {}

  async list(tenantId: number, viewer: BuyerViewer, leadId: number): Promise<SuggestionItem[]> {
    const lead = await this.buyers.get(tenantId, viewer, leadId);
    const rows = await this.suggestionRepository.find({
      where: { tenantId, leadId: lead.id },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    const cards = await this.matchService.cards(tenantId, rows.map((r) => r.propertyId));
    return rows.map((r) => ({
      id: r.id,
      propertyId: r.propertyId,
      note: r.note,
      virtualTourUrl: r.virtualTourUrl,
      visitDate: r.visitDate,
      status: r.status,
      sentAt: r.sentAt,
      openedAt: r.openedAt,
      clickedAt: r.clickedAt,
      likedAt: r.likedAt,
      rejectedAt: r.rejectedAt,
      rejectReason: r.rejectReason,
      viewingAt: r.viewingAt,
      offerAt: r.offerAt,
      createdAt: r.createdAt,
      property: cards.get(r.propertyId) ?? null,
    }));
  }

  async suggestedIds(tenantId: number, leadId: number): Promise<Set<number>> {
    const rows = await this.suggestionRepository.find({ where: { tenantId, leadId }, select: ['propertyId'] });
    return new Set(rows.map((r) => r.propertyId));
  }

  // Never send twice: properties already sent to this buyer, or rejected
  // by them. They are left out of new matches and skipped on send.
  async hiddenIds(tenantId: number, leadId: number): Promise<Map<number, HiddenReason>> {
    const rows = await this.suggestionRepository
      .createQueryBuilder('s')
      .select(['s.propertyId', 's.sentAt', 's.rejectedAt', 's.status'])
      .where('s.tenantId = :tenantId AND s.leadId = :leadId', { tenantId, leadId })
      .andWhere("(s.sentAt IS NOT NULL OR s.rejectedAt IS NOT NULL OR s.status = 'not_interested')")
      .getMany();
    return new Map(rows.map((r) => [r.propertyId, r.rejectedAt || r.status === 'not_interested' ? 'rejected' : 'sent']));
  }

  // Adds the client's live listings by id or reference. Ones already on
  // the list are left as they are; unknown ones are reported back.
  async add(
    tenantId: number,
    viewer: BuyerViewer,
    leadId: number,
    dto: AddSuggestionsDto,
  ): Promise<{ added: number; existing: number; notFound: (string | number)[] }> {
    const lead = await this.buyers.get(tenantId, viewer, leadId);
    const ids = [...new Set(dto.propertyIds || [])];
    const refs = [...new Set((dto.references || []).map((r) => r.trim()).filter(Boolean))];
    const found = await this.liveListings(tenantId, ids, refs);

    const notFound: (string | number)[] = [
      ...ids.filter((id) => !found.some((p) => p.id === id)),
      ...refs.filter((r) => !found.some((p) => sameRef(p.reference, r) || sameRef(p.agentReference, r))),
    ];
    const already = await this.suggestedIds(tenantId, lead.id);
    const fresh = found.filter((p) => !already.has(p.id));
    if (fresh.length) {
      await this.suggestionRepository
        .createQueryBuilder()
        .insert()
        .values(fresh.map((p) => ({ tenantId, leadId: lead.id, propertyId: p.id, status: 'suggested' as const, createdBy: viewer.id })))
        .orIgnore()
        // Skipped rows have no id to map back (TypeORM would throw).
        .updateEntity(false)
        .execute();
    }
    return { added: fresh.length, existing: found.length - fresh.length, notFound };
  }

  async update(tenantId: number, viewer: BuyerViewer, id: number, dto: UpdateSuggestionDto): Promise<SuggestionItem> {
    const row = await this.own(tenantId, viewer, id);
    const patch: Partial<LeadSuggestion> = {};
    if (dto.note !== undefined) patch.note = dto.note?.trim() ? dto.note : null;
    if (dto.virtualTourUrl !== undefined) patch.virtualTourUrl = dto.virtualTourUrl;
    if (dto.visitDate !== undefined) patch.visitDate = dto.visitDate ? new Date(dto.visitDate) : null;
    if (dto.status !== undefined) patch.status = dto.status;
    if (Object.keys(patch).length) await this.suggestionRepository.update({ id: row.id, tenantId }, patch);
    const items = await this.list(tenantId, viewer, row.leadId);
    return items.find((i) => i.id === row.id)!;
  }

  async remove(tenantId: number, viewer: BuyerViewer, id: number): Promise<void> {
    const row = await this.own(tenantId, viewer, id);
    await this.suggestionRepository.delete({ id: row.id, tenantId });
  }

  // After an email went out: every sent property is on the list with
  // status sent and the time, unless the agent already recorded feedback.
  async markSent(tenantId: number, userId: number | null, leadId: number, propertyIds: number[]): Promise<void> {
    if (!propertyIds.length) return;
    const now = new Date();
    await this.suggestionRepository
      .createQueryBuilder()
      .insert()
      .values(propertyIds.map((propertyId) => ({ tenantId, leadId, propertyId, status: 'sent' as const, sentAt: now, createdBy: userId })))
      .orIgnore()
      .updateEntity(false)
      .execute();
    await this.suggestionRepository.update({ tenantId, leadId, propertyId: In(propertyIds) }, { sentAt: now });
    await this.suggestionRepository.update(
      { tenantId, leadId, propertyId: In(propertyIds), status: In(SENT_OVERWRITES) },
      { status: 'sent' },
    );
  }

  // The client's active, published listings among these ids / references.
  async liveListings(tenantId: number, ids: number[], refs: string[] = []): Promise<Property[]> {
    if (!ids.length && !refs.length) return [];
    const qb = this.propertyRepository
      .createQueryBuilder('p')
      .select(['p.id', 'p.reference', 'p.agentReference'])
      .where('p.tenantId = :tenantId', { tenantId })
      .andWhere('p.status = :status', { status: 'active' })
      .andWhere('p.isPublished = :published', { published: true });
    const parts: string[] = [];
    if (ids.length) parts.push('p.id IN (:...ids)');
    if (refs.length) parts.push('p.reference IN (:...refs) OR p.agentReference IN (:...refs)');
    qb.andWhere(`(${parts.join(' OR ')})`, { ids, refs });
    return qb.getMany();
  }

  private async own(tenantId: number, viewer: BuyerViewer, id: number): Promise<LeadSuggestion> {
    const row = await this.suggestionRepository.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Suggestion not found');
    await this.buyers.get(tenantId, viewer, row.leadId); // 404 when the buyer isn't visible
    return row;
  }
}

function sameRef(a: string | null | undefined, b: string): boolean {
  return !!a && a.toLowerCase() === b.toLowerCase();
}
