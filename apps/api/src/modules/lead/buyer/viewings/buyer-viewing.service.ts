import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BuyerTrip, BuyerViewing, Lead, LeadSuggestion, Property, User, type ViewingStatus } from '../../../../database/entities';
import { applyVisibility, type BuyerViewer } from '../buyer-access';
import { BuyerService } from '../buyer.service';
import { BuyerSettingsService } from '../buyer-settings.service';
import { BuyerMatchService } from '../buyer-match.service';
import type { BuyerPropertyCard } from '../buyer-property-card';
import { BuyerTrackingService } from '../tracking/buyer-tracking.service';

export interface TripInput {
  startDate: string;
  endDate: string;
  notes?: string | null;
}

export interface ViewingInput {
  tripId?: number | null;
  propertyId?: number | null;
  title?: string | null;
  startsAt?: string;
  durationMin?: number;
  agentId?: number | null;
  meetingPoint?: string | null;
  status?: ViewingStatus;
  feedback?: string | null;
  interest?: number | null;
}

export interface ViewingItem {
  id: number;
  leadId: number;
  tripId: number | null;
  propertyId: number | null;
  title: string | null;
  startsAt: Date;
  durationMin: number;
  agent: { id: number; name: string | null } | null;
  meetingPoint: string | null;
  status: ViewingStatus;
  feedback: string | null;
  interest: number | null;
  property: BuyerPropertyCard | null;
  buyer?: { id: number; name: string | null };
}

export interface TripItem {
  id: number;
  startDate: string;
  endDate: string;
  notes: string | null;
  viewings: ViewingItem[];
}

const day = (d: Date) => d.toISOString().slice(0, 10);

// Trips (a buyer's visiting period) and their viewings. Planning a viewing
// moves the property's timeline to "Viewing"; marking it done records the
// feedback and sets the suggestion to visited.
@Injectable()
export class BuyerViewingService {
  constructor(
    @InjectRepository(BuyerTrip) private readonly trips: Repository<BuyerTrip>,
    @InjectRepository(BuyerViewing) private readonly viewings: Repository<BuyerViewing>,
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(LeadSuggestion) private readonly suggestions: Repository<LeadSuggestion>,
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly buyers: BuyerService,
    private readonly settings: BuyerSettingsService,
    private readonly matchService: BuyerMatchService,
    private readonly tracking: BuyerTrackingService,
  ) {}

  // ── Trips ──────────────────────────────────────────────────────────────

  async listTrips(tenantId: number, viewer: BuyerViewer, leadId: number): Promise<{ trips: TripItem[]; loose: ViewingItem[] }> {
    const lead = await this.buyers.get(tenantId, viewer, leadId);
    const trips = await this.trips.find({ where: { tenantId, leadId: lead.id }, order: { startDate: 'DESC', id: 'DESC' } });
    const rows = await this.viewings.find({ where: { tenantId, leadId: lead.id }, relations: { agent: true }, order: { startsAt: 'ASC', id: 'ASC' } });
    const items = await this.toItems(tenantId, rows);
    return {
      trips: trips.map((t) => ({ id: t.id, startDate: t.startDate, endDate: t.endDate, notes: t.notes, viewings: items.filter((v) => v.tripId === t.id) })),
      loose: items.filter((v) => !v.tripId || !trips.some((t) => t.id === v.tripId)),
    };
  }

  async createTrip(tenantId: number, viewer: BuyerViewer, leadId: number, dto: TripInput): Promise<BuyerTrip> {
    const lead = await this.buyers.get(tenantId, viewer, leadId);
    assertRange(dto.startDate, dto.endDate);
    const trip = await this.trips.save(
      this.trips.create({ tenantId, leadId: lead.id, startDate: dto.startDate, endDate: dto.endDate, notes: dto.notes?.trim() || null, createdBy: viewer.id }),
    );
    await this.syncVisit(tenantId, lead.id);
    return trip;
  }

  async updateTrip(tenantId: number, viewer: BuyerViewer, id: number, dto: Partial<TripInput>): Promise<BuyerTrip> {
    const trip = await this.ownTrip(tenantId, viewer, id);
    const next = { startDate: dto.startDate ?? trip.startDate, endDate: dto.endDate ?? trip.endDate };
    assertRange(next.startDate, next.endDate);
    await this.trips.update({ id: trip.id }, { ...next, ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}) });
    await this.syncVisit(tenantId, trip.leadId);
    return (await this.trips.findOne({ where: { id: trip.id } }))!;
  }

  // The trip goes; its viewings stay, loose.
  async deleteTrip(tenantId: number, viewer: BuyerViewer, id: number): Promise<void> {
    const trip = await this.ownTrip(tenantId, viewer, id);
    await this.trips.delete({ id: trip.id });
    await this.syncVisit(tenantId, trip.leadId);
  }

  async trip(tenantId: number, viewer: BuyerViewer, id: number): Promise<BuyerTrip> {
    return this.ownTrip(tenantId, viewer, id);
  }

  // leads.visitStart/visitEnd follow the next trip that has not ended, else
  // the latest one (the list, the stale rule and the Odoo import use them).
  private async syncVisit(tenantId: number, leadId: number): Promise<void> {
    const all = await this.trips.find({ where: { tenantId, leadId }, order: { startDate: 'ASC' } });
    const today = day(new Date());
    const pick = all.find((t) => String(t.endDate).slice(0, 10) >= today) ?? all[all.length - 1] ?? null;
    await this.leads
      .createQueryBuilder()
      .update()
      .set({ visitStart: pick?.startDate ?? null, visitEnd: pick?.endDate ?? null, updatedAt: () => 'updatedAt' } as never)
      .where('id = :id', { id: leadId })
      .execute();
  }

  // ── Viewings ───────────────────────────────────────────────────────────

  async createViewing(tenantId: number, viewer: BuyerViewer, leadId: number, dto: ViewingInput): Promise<ViewingItem> {
    const lead = await this.buyers.get(tenantId, viewer, leadId);
    if (!dto.startsAt) throw new BadRequestException({ code: 'NO_TIME', message: 'When is the viewing?' });
    if (!dto.propertyId && !dto.title?.trim()) throw new BadRequestException({ code: 'NO_PROPERTY', message: 'Pick a property or type what is being viewed' });
    await this.checkRefs(tenantId, lead.id, dto);
    const row = await this.viewings.save(
      this.viewings.create({
        tenantId,
        leadId: lead.id,
        tripId: dto.tripId ?? null,
        propertyId: dto.propertyId ?? null,
        title: dto.title?.trim() || null,
        startsAt: new Date(dto.startsAt),
        durationMin: dto.durationMin ?? 60,
        agentId: dto.agentId !== undefined ? dto.agentId : lead.assignedTo ?? viewer.id,
        meetingPoint: dto.meetingPoint?.trim() || null,
        status: 'planned',
        createdBy: viewer.id,
      }),
    );
    const card = row.propertyId ? (await this.matchService.cards(tenantId, [row.propertyId])).get(row.propertyId) : null;
    if (row.propertyId) {
      await this.ensureSuggestion(tenantId, lead.id, row.propertyId, viewer.id);
      await this.tracking.record({ tenantId, leadId: lead.id, propertyIds: [row.propertyId], event: 'viewing', source: 'agent', userId: viewer.id });
    }
    await this.buyers.log(lead.id, viewer.id, 'viewing_planned', null, {
      viewingId: row.id, propertyId: row.propertyId, reference: card?.reference ?? null, title: row.title, startsAt: row.startsAt,
    });
    return (await this.items(tenantId, [row.id]))[0];
  }

  async updateViewing(tenantId: number, viewer: BuyerViewer, id: number, dto: ViewingInput): Promise<ViewingItem> {
    const row = await this.ownViewing(tenantId, viewer, id);
    await this.checkRefs(tenantId, row.leadId, dto);
    const patch: Partial<BuyerViewing> = {};
    if (dto.tripId !== undefined) patch.tripId = dto.tripId;
    if (dto.title !== undefined) patch.title = dto.title?.trim() || null;
    if (dto.startsAt !== undefined) {
      patch.startsAt = new Date(dto.startsAt);
      // A new time deserves a new reminder.
      if (+patch.startsAt !== +new Date(row.startsAt)) patch.reminderSentAt = null;
    }
    if (dto.durationMin !== undefined) patch.durationMin = dto.durationMin;
    if (dto.agentId !== undefined) patch.agentId = dto.agentId;
    if (dto.meetingPoint !== undefined) patch.meetingPoint = dto.meetingPoint?.trim() || null;
    if (dto.feedback !== undefined) patch.feedback = dto.feedback?.trim() || null;
    if (dto.interest !== undefined) patch.interest = dto.interest;
    if (dto.status !== undefined) patch.status = dto.status;
    if (Object.keys(patch).length) await this.viewings.update({ id: row.id }, patch);

    if (dto.status === 'done' && row.status !== 'done') {
      const card = row.propertyId ? (await this.matchService.cards(tenantId, [row.propertyId])).get(row.propertyId) : null;
      if (row.propertyId) {
        await this.ensureSuggestion(tenantId, row.leadId, row.propertyId, viewer.id);
        await this.suggestions.update({ tenantId, leadId: row.leadId, propertyId: row.propertyId }, { status: 'visited' });
      }
      await this.buyers.log(row.leadId, viewer.id, 'viewing_done', patch.feedback ?? row.feedback ?? null, {
        viewingId: row.id, propertyId: row.propertyId, reference: card?.reference ?? null, title: row.title,
        interest: patch.interest ?? row.interest ?? null,
      }, true);
    }
    return (await this.items(tenantId, [row.id]))[0];
  }

  async deleteViewing(tenantId: number, viewer: BuyerViewer, id: number): Promise<void> {
    const row = await this.ownViewing(tenantId, viewer, id);
    await this.viewings.delete({ id: row.id });
  }

  // The calendar: every visible viewing between two dates.
  async calendar(tenantId: number, viewer: BuyerViewer, from: Date, to: Date, agentId?: number): Promise<ViewingItem[]> {
    const { agentsSeeAll } = await this.settings.get(tenantId);
    const qb = this.viewings
      .createQueryBuilder('v')
      .innerJoin('v.lead', 'lead')
      .where('v.tenantId = :tenantId', { tenantId })
      .andWhere('lead.mergedIntoId IS NULL')
      .andWhere('v.startsAt BETWEEN :from AND :to', { from, to })
      .orderBy('v.startsAt', 'ASC');
    applyVisibility(qb, viewer, agentsSeeAll);
    if (agentId) qb.andWhere('v.agentId = :agentId', { agentId });
    const ids = (await qb.select('v.id', 'id').getRawMany<{ id: number }>()).map((r) => Number(r.id));
    return this.items(tenantId, ids, true);
  }

  async items(tenantId: number, ids: number[], withBuyer = false): Promise<ViewingItem[]> {
    if (!ids.length) return [];
    const rows = await this.viewings.find({ where: { tenantId, id: In(ids) }, relations: { agent: true, ...(withBuyer ? { lead: true } : {}) }, order: { startsAt: 'ASC', id: 'ASC' } });
    return this.toItems(tenantId, rows, withBuyer);
  }

  private async toItems(tenantId: number, rows: BuyerViewing[], withBuyer = false): Promise<ViewingItem[]> {
    const cards = await this.matchService.cards(tenantId, [...new Set(rows.map((r) => r.propertyId).filter((x): x is number => !!x))]);
    return rows.map((r) => ({
      id: r.id,
      leadId: r.leadId,
      tripId: r.tripId,
      propertyId: r.propertyId,
      title: r.title,
      startsAt: r.startsAt,
      durationMin: r.durationMin,
      agent: r.agent ? { id: r.agent.id, name: r.agent.name } : null,
      meetingPoint: r.meetingPoint,
      status: r.status,
      feedback: r.feedback,
      interest: r.interest,
      property: r.propertyId ? cards.get(r.propertyId) ?? null : null,
      ...(withBuyer && r.lead ? { buyer: { id: r.lead.id, name: [r.lead.firstName, r.lead.lastName].filter(Boolean).join(' ') || null } } : {}),
    }));
  }

  // ── Reminders (BullMQ job, every 5 minutes) ─────────────────────────────

  // Viewings starting within the agency's reminder window that have had no
  // reminder. The UPDATE claims each one, so two processes never both send.
  async claimReminders(now = new Date()): Promise<BuyerViewing[]> {
    const rows: { id: number; tenantId: number; settings: string | null }[] = await this.viewings.manager.query(
      `SELECT v.id, v.tenantId, t.settings FROM buyer_viewings v JOIN tenants t ON t.id = v.tenantId
       WHERE v.status = 'planned' AND v.reminderSentAt IS NULL AND v.startsAt > ? AND v.startsAt <= ?`,
      [now, new Date(now.getTime() + 24 * 3_600_000)],
    );
    const claimed: BuyerViewing[] = [];
    for (const r of rows) {
      const s = typeof r.settings === 'string' ? JSON.parse(r.settings) : r.settings;
      const minutes = Number(s?.buyerMatch?.viewingReminderMinutes ?? 60);
      if (!(minutes > 0)) continue;
      const v = await this.viewings.findOne({ where: { id: Number(r.id) } });
      if (!v || +new Date(v.startsAt) - now.getTime() > minutes * 60_000) continue;
      const res = await this.viewings
        .createQueryBuilder()
        .update()
        .set({ reminderSentAt: now })
        .where('id = :id AND reminderSentAt IS NULL', { id: v.id })
        .execute();
      if (res.affected) claimed.push(v);
    }
    return claimed;
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private async ensureSuggestion(tenantId: number, leadId: number, propertyId: number, userId: number): Promise<void> {
    await this.suggestions
      .createQueryBuilder()
      .insert()
      .values({ tenantId, leadId, propertyId, status: 'suggested', createdBy: userId })
      .orIgnore()
      .updateEntity(false)
      .execute();
  }

  private async checkRefs(tenantId: number, leadId: number, dto: ViewingInput): Promise<void> {
    if (dto.propertyId) {
      const ok = await this.properties.count({ where: { tenantId, id: dto.propertyId } });
      if (!ok) throw new BadRequestException({ code: 'UNKNOWN_PROPERTY', message: 'Unknown property' });
    }
    if (dto.tripId) {
      const ok = await this.trips.count({ where: { tenantId, leadId, id: dto.tripId } });
      if (!ok) throw new BadRequestException({ code: 'UNKNOWN_TRIP', message: 'That trip is not this buyer\'s' });
    }
    if (dto.agentId) {
      const ok = await this.users.count({ where: { tenantId, id: dto.agentId, isActive: true } });
      if (!ok) throw new BadRequestException({ code: 'UNKNOWN_AGENT', message: 'Unknown agent' });
    }
  }

  private async ownTrip(tenantId: number, viewer: BuyerViewer, id: number): Promise<BuyerTrip> {
    const trip = await this.trips.findOne({ where: { id, tenantId } });
    if (!trip) throw new NotFoundException('Trip not found');
    await this.buyers.get(tenantId, viewer, trip.leadId);
    return trip;
  }

  private async ownViewing(tenantId: number, viewer: BuyerViewer, id: number): Promise<BuyerViewing> {
    const row = await this.viewings.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Viewing not found');
    await this.buyers.get(tenantId, viewer, row.leadId);
    return row;
  }
}

function assertRange(start: string, end: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new BadRequestException({ code: 'BAD_DATE', message: 'Dates must be YYYY-MM-DD' });
  if (start > end) throw new BadRequestException({ code: 'BAD_RANGE', message: 'The trip ends before it starts' });
}
