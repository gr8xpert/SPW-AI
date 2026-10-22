import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { BuyerService } from '../buyer.service';
import { BuyerChangeLogService } from '../buyer-change-log.service';
import { BuyerQuestionService } from '../buyer-question.service';
import type { BuyerViewer } from '../buyer-access';
import type { ListBuyersDto } from '../dto/buyer.dto';
import { findDuplicates, type DuplicateGroup } from './duplicates';
import { mergeAgents, planSuggestions, type MergeSuggestion } from './merge-plan';
import { toCsv } from './csv';
import { MAX_RULES } from '../ai/note-rules';

// Milestone J housekeeping (managers): possible duplicates, merging two
// buyers, and the CSV export of the list.

// Rows of these tables simply move to the kept buyer.
const MOVE_TABLES = ['lead_suggestion_events', 'lead_activities', 'lead_changes', 'lead_files', 'buyer_tasks', 'buyer_trips', 'buyer_viewings', 'buyer_sends', 'buyer_alerts'];
// Empty fields of the kept buyer are filled from the merged one.
const FILL_FIELDS = ['firstName', 'lastName', 'phone', 'mobile', 'language', 'country', 'city', 'street', 'zip', 'state', 'idType', 'idNumber', 'lawyer', 'dealValue', 'visitStart', 'visitEnd', 'consentAt', 'consentSource'];
const EXPORT_LIMIT = 20_000;

const en = (n: unknown): string => {
  const o = (typeof n === 'string' ? (() => { try { return JSON.parse(n); } catch { return { en: n }; } })() : n) as Record<string, string> | null;
  return o ? o.en || Object.values(o).find(Boolean) || '' : '';
};

export interface DuplicateBuyer {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  agent: string | null;
  stage: string | null;
  createdAt: Date;
}

@Injectable()
export class BuyerHousekeepingService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly buyers: BuyerService,
    private readonly changeLog: BuyerChangeLogService,
    private readonly questions: BuyerQuestionService,
  ) {}

  async duplicates(tenantId: number): Promise<{ groups: (DuplicateGroup & { buyers: DuplicateBuyer[] })[] }> {
    const rows: { id: number; firstName: string | null; lastName: string | null; phone: string | null; mobile: string | null; email: string | null; agent: string | null; stage: unknown; createdAt: Date }[] =
      await this.db.query(
        `SELECT l.id, l.firstName, l.lastName, l.phone, l.mobile, c.email, COALESCE(u.name, u.email) AS agent, s.name AS stage, l.createdAt
         FROM leads l LEFT JOIN contacts c ON c.id = l.contactId LEFT JOIN users u ON u.id = l.assignedTo LEFT JOIN buyer_stages s ON s.id = l.stageId
         WHERE l.tenantId = ? AND l.mergedIntoId IS NULL AND l.erasedAt IS NULL`,
        [tenantId],
      );
    const byId = new Map(rows.map((r) => [r.id, r]));
    const groups = findDuplicates(rows.map((r) => ({ id: r.id, firstName: r.firstName, lastName: r.lastName, phones: [r.phone, r.mobile] })));
    return {
      groups: groups.slice(0, 200).map((g) => ({
        ...g,
        buyers: g.ids.map((id) => {
          const r = byId.get(id)!;
          return {
            id,
            name: [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email || `#${id}`,
            email: r.email,
            phone: r.mobile || r.phone,
            agent: r.agent,
            stage: r.stage ? en(r.stage) : null,
            createdAt: r.createdAt,
          };
        }),
      })),
    };
  }

  // Merges `sourceId` into `keepId`. Nothing is deleted except a suggestion
  // of the same property that got less far (its events are kept).
  async merge(tenantId: number, viewer: BuyerViewer, keepId: number, sourceId: number): Promise<{ id: number; merged: number }> {
    if (keepId === sourceId) throw new BadRequestException({ code: 'SAME_BUYER', message: 'Pick two different buyers' });
    const keep = await this.buyers.get(tenantId, viewer, keepId);
    const source = await this.buyers.get(tenantId, viewer, sourceId);
    if (keep.erasedAt || source.erasedAt) throw new BadRequestException({ code: 'ERASED', message: 'An erased buyer cannot be merged' });

    await this.db.transaction(async (m: EntityManager) => {
      const cols = 'id, propertyId, sentAt, openedAt, clickedAt, likedAt, rejectedAt, rejectReason, viewingAt, offerAt';
      const kept: MergeSuggestion[] = await m.query(`SELECT ${cols} FROM lead_suggestions WHERE leadId = ?`, [keepId]);
      const moved: MergeSuggestion[] = await m.query(`SELECT ${cols} FROM lead_suggestions WHERE leadId = ?`, [sourceId]);
      const plan = planSuggestions(kept, moved);
      const sourceIds = new Set(moved.map((s) => s.id));
      for (const { keep: k, drop } of plan.replace) {
        await m.query('DELETE FROM lead_suggestions WHERE id = ?', [drop]);
        if (sourceIds.has(k)) await m.query('UPDATE lead_suggestions SET leadId = ? WHERE id = ?', [keepId, k]);
      }
      if (plan.move.length) await m.query('UPDATE lead_suggestions SET leadId = ? WHERE id IN (?)', [keepId, plan.move]);
      for (const table of MOVE_TABLES) await m.query(`UPDATE ${table} SET leadId = ? WHERE leadId = ?`, [keepId, sourceId]);

      const agents = mergeAgents(
        keep.assignedTo,
        (keep.agents ?? []).map((a) => a.userId),
        (source.agents ?? []).map((a) => a.userId),
        source.assignedTo,
      );
      await m.query('DELETE FROM lead_agents WHERE leadId IN (?)', [[keepId, sourceId]]);
      for (const userId of agents) await m.query('INSERT INTO lead_agents (leadId, userId) VALUES (?, ?)', [keepId, userId]);

      const fill: Record<string, unknown> = {};
      for (const f of FILL_FIELDS) {
        const k = (keep as unknown as Record<string, unknown>)[f];
        const s = (source as unknown as Record<string, unknown>)[f];
        if ((k === null || k === undefined || k === '') && s !== null && s !== undefined && s !== '') fill[f] = s;
      }
      if (source.notes?.trim()) fill.notes = [keep.notes?.trim(), `— Merged from buyer #${sourceId} —\n${source.notes.trim()}`].filter(Boolean).join('\n\n').slice(0, 20000);
      // Rules from the notes: the kept buyer's, plus the merged one's that are new.
      const keptRules = keep.noteRules ?? [];
      const newRules = (source.noteRules ?? []).filter((r) => !keptRules.some((k) => k.id === r.id));
      if (newRules.length) fill.noteRules = JSON.stringify([...keptRules, ...newRules].slice(0, MAX_RULES));
      if (Object.keys(fill).length) {
        await m.query(`UPDATE leads SET ${Object.keys(fill).map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...Object.values(fill), keepId]);
      }
      // The merged record keeps its own page code but stops serving it.
      await m.query('UPDATE leads SET mergedIntoId = ?, pageEnabled = 0 WHERE id = ?', [keepId, sourceId]);
      await m.query('UPDATE leads SET mergedIntoId = ? WHERE mergedIntoId = ?', [keepId, sourceId]);
    });

    const name = (l: { firstName: string | null; lastName: string | null; contact?: { email: string } | null; id: number }) =>
      [l.firstName, l.lastName].filter(Boolean).join(' ') || l.contact?.email || `#${l.id}`;
    await this.buyers.log(keepId, viewer.id, 'merge', `Merged ${name(source)} (#${sourceId}) into this buyer`, { sourceId }, false);
    await this.buyers.log(sourceId, viewer.id, 'merge', `Merged into ${name(keep)} (#${keepId})`, { keepId }, false);
    await this.changeLog.record(tenantId, keepId, viewer.id, 'dashboard', [{ field: 'merged', from: null, to: `#${sourceId} ${name(source)}` }]);
    await this.changeLog.record(tenantId, sourceId, viewer.id, 'dashboard', [{ field: 'mergedInto', from: null, to: `#${keepId} ${name(keep)}` }]);
    return { id: keepId, merged: sourceId };
  }

  // The list (same filters, ignoring paging) as CSV for Excel.
  async exportCsv(tenantId: number, viewer: BuyerViewer, dto: ListBuyersDto): Promise<{ filename: string; csv: string }> {
    const qb = (await this.buyers.filtered(tenantId, viewer, dto))
      .andWhere('lead.erasedAt IS NULL')
      .orderBy('lead.id', 'ASC')
      .take(EXPORT_LIMIT);
    const leads = await qb.getMany();
    const questions = (await this.questions.list(tenantId)).filter((q) => q.isActive);

    const locIds = new Set<number>();
    const typeIds = new Set<number>();
    leads.forEach((l) => {
      l.wishlist?.locationIds?.forEach((id) => locIds.add(id));
      l.wishlist?.propertyTypeIds?.forEach((id) => typeIds.add(id));
    });
    const names = async (table: string, ids: Set<number>) => {
      if (!ids.size) return new Map<number, string>();
      const rows: { id: number; name: unknown }[] = await this.db.query(`SELECT id, name FROM ${table} WHERE tenantId = ? AND id IN (?)`, [tenantId, [...ids]]);
      return new Map(rows.map((r) => [r.id, en(r.name)]));
    };
    const locs = await names('locations', locIds);
    const types = await names('property_types', typeIds);

    const header = [
      'ID', 'First name', 'Last name', 'Email', 'Phone', 'Mobile', 'Contact type', 'Stage', 'Agent', 'Source', 'Priority',
      'Budget from', 'Budget to', 'Locations', 'Property types', 'Bedrooms from', 'Language', 'Country',
      'Created', 'Last activity', 'Consent', 'Unsubscribed',
      ...questions.map((q) => en(q.label)),
    ];
    const day = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');
    const rows = leads.map((l) => [
      l.id, l.firstName, l.lastName, l.contact?.email, l.phone, l.mobile, l.role, l.stage ? en(l.stage.name) : '',
      l.assignedToUser ? l.assignedToUser.name || l.assignedToUser.email : '', l.source, l.priority,
      l.wishlist?.budgetMin ?? '', l.wishlist?.budgetMax ?? '',
      (l.wishlist?.locationIds ?? []).map((id) => locs.get(id)).filter(Boolean).join('; '),
      (l.wishlist?.propertyTypeIds ?? []).map((id) => types.get(id)).filter(Boolean).join('; '),
      l.wishlist?.minBedrooms ?? '', l.language, l.country,
      day(l.createdAt), day(l.lastActivityAt), day(l.consentAt), day(l.unsubscribedAt),
      ...questions.map((q) => (l.answers?.[q.qkey] ?? []).map((k) => en(q.options.find((o) => o.key === k)?.label) || k).join('; ')),
    ]);
    return { filename: `buyers-${new Date().toISOString().slice(0, 10)}.csv`, csv: toCsv(header, rows) };
  }
}
