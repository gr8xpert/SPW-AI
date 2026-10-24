import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import type { BuyerMatchSettings } from '@spm/shared';
import { Lead } from '../../../../database/entities';
import { applyVisibility, seesAllBuyers, type BuyerViewer } from '../buyer-access';
import { BuyerSettingsService } from '../buyer-settings.service';
import { toCsv } from '../housekeeping/csv';
import type { LeadReportQueryDto } from '../dto/lead-report.dto';
import { agentSummaries, attemptSql, followUp, reachedSql, type AgentSummary, type FollowUp, type ReportActivity } from './lead-report';

// Lead Report: every lead (New Leads included) with its follow-up, and a
// summary per agent. Managers see everyone; an agent sees the leads the
// Buyer Match rules show them (their own, unless agents see all).

const EXPORT_LIMIT = 5000;
const CHUNK = 500;

export interface LeadReportRow {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  source: string;
  role: string;
  isNewLead: boolean;
  createdAt: Date;
  stage: { id: number; name: Record<string, string>; color: string | null; kind: string } | null;
  agent: { id: number; name: string | null } | null;
  budgetMin: number | null;
  budgetMax: number | null;
  followUp: FollowUp;
}

export interface LeadReportSummary {
  overdueHours: number;
  totals: AgentSummary;
  agents: (AgentSummary & { name: string | null })[];
}

const ATTEMPT_EXISTS = `EXISTS (SELECT 1 FROM lead_activities ra WHERE ra.leadId = lead.id AND ${attemptSql('ra')})`;
const REACHED_EXISTS = `EXISTS (SELECT 1 FROM lead_activities rr WHERE rr.leadId = lead.id AND ${reachedSql('rr')})`;

const json = <T>(v: unknown): T | null => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return v as T;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
};

const fullName = (l: { firstName: string | null; lastName: string | null; contact?: { email: string } | null }) =>
  [l.firstName, l.lastName].filter(Boolean).join(' ') || l.contact?.email || '—';

@Injectable()
export class LeadReportService {
  constructor(
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectDataSource() private readonly db: DataSource,
    private readonly settingsService: BuyerSettingsService,
  ) {}

  // The rows the report covers; `withStatus` false for the summary (it
  // counts every status).
  private async base(tenantId: number, viewer: BuyerViewer, dto: LeadReportQueryDto, settings: BuyerMatchSettings, now: Date, withStatus = true) {
    const qb = this.leads
      .createQueryBuilder('lead')
      .leftJoin('lead.contact', 'contact')
      .leftJoin('lead.stage', 'stage')
      .where('lead.tenantId = :tenantId', { tenantId })
      .andWhere('lead.mergedIntoId IS NULL')
      .andWhere('lead.erasedAt IS NULL');
    applyVisibility(qb, viewer, settings.agentsSeeAll);

    if (dto.q) {
      qb.andWhere(
        "(contact.email LIKE :q OR CONCAT_WS(' ', lead.firstName, lead.lastName) LIKE :q OR lead.phone LIKE :q OR lead.mobile LIKE :q)",
        { q: `%${dto.q.replace(/[%_]/g, '\\$&')}%` },
      );
    }
    if (dto.agentId === 0) qb.andWhere('lead.assignedTo IS NULL');
    else if (dto.agentId) qb.andWhere('lead.assignedTo = :agentId', { agentId: dto.agentId });
    if (dto.stageId) qb.andWhere('lead.stageId = :stageId', { stageId: dto.stageId });
    if (dto.source) qb.andWhere('lead.source = :source', { source: dto.source });
    if (dto.from) qb.andWhere('lead.createdAt >= :from', { from: new Date(dto.from) });
    if (dto.to) qb.andWhere('lead.createdAt <= :to', { to: new Date(dto.to) });

    if (withStatus && dto.status) {
      const cutoff = new Date(now.getTime() - settings.firstContactHours * 3_600_000);
      if (dto.status === 'not_contacted') qb.andWhere(`NOT ${ATTEMPT_EXISTS}`);
      if (dto.status === 'overdue') qb.andWhere(`NOT ${ATTEMPT_EXISTS}`).andWhere('lead.createdAt <= :cutoff', { cutoff });
      if (dto.status === 'tried') qb.andWhere(ATTEMPT_EXISTS).andWhere(`NOT ${REACHED_EXISTS}`);
      if (dto.status === 'reached') qb.andWhere(REACHED_EXISTS);
    }
    return qb;
  }

  private selectRow(qb: SelectQueryBuilder<Lead>): SelectQueryBuilder<Lead> {
    return qb
      .leftJoin('lead.assignedToUser', 'agent')
      .select([
        'lead.id', 'lead.firstName', 'lead.lastName', 'lead.phone', 'lead.mobile', 'lead.source', 'lead.role', 'lead.isNewLead',
        'lead.createdAt', 'lead.assignedTo', 'lead.stageId', 'lead.budgetMin', 'lead.budgetMax', 'lead.wishlist',
        'contact.id', 'contact.email', 'stage.id', 'stage.name', 'stage.color', 'stage.kind', 'agent.id', 'agent.name', 'agent.email',
      ]);
  }

  private async activities(leadIds: number[]): Promise<Map<number, ReportActivity[]>> {
    const out = new Map<number, ReportActivity[]>();
    for (let i = 0; i < leadIds.length; i += CHUNK) {
      const ids = leadIds.slice(i, i + CHUNK);
      const rows: { leadId: number; type: string; userId: number | null; createdAt: Date; description: string | null; metadata: unknown }[] = await this.db.query(
        'SELECT leadId, type, userId, createdAt, LEFT(description, 2000) AS description, metadata FROM lead_activities WHERE leadId IN (?) ORDER BY id',
        [ids],
      );
      for (const r of rows) {
        const list = out.get(r.leadId) ?? [];
        list.push({ type: r.type, userId: r.userId, createdAt: r.createdAt, description: r.description, metadata: json(r.metadata) });
        out.set(r.leadId, list);
      }
    }
    return out;
  }

  private async rows(leads: Lead[], settings: BuyerMatchSettings, now: Date): Promise<LeadReportRow[]> {
    const acts = await this.activities(leads.map((l) => l.id));
    return leads.map((l) => ({
      id: l.id,
      name: fullName(l),
      email: l.contact?.email ?? null,
      phone: l.phone,
      mobile: l.mobile,
      source: l.source,
      role: l.role,
      isNewLead: !!l.isNewLead,
      createdAt: l.createdAt,
      stage: l.stage ? { id: l.stage.id, name: json<Record<string, string>>(l.stage.name) ?? {}, color: l.stage.color, kind: l.stage.kind } : null,
      agent: l.assignedToUser ? { id: l.assignedToUser.id, name: l.assignedToUser.name || l.assignedToUser.email } : null,
      budgetMin: l.wishlist?.budgetMin ?? (l.budgetMin !== null ? Number(l.budgetMin) : null),
      budgetMax: l.wishlist?.budgetMax ?? (l.budgetMax !== null ? Number(l.budgetMax) : null),
      followUp: followUp(l, acts.get(l.id) ?? [], now, settings.firstContactHours),
    }));
  }

  async list(tenantId: number, viewer: BuyerViewer, dto: LeadReportQueryDto, now = new Date()) {
    const settings = await this.settingsService.get(tenantId);
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;
    const qb = this.selectRow(await this.base(tenantId, viewer, dto, settings, now))
      .orderBy('lead.createdAt', dto.sort === 'oldest' ? 'ASC' : 'DESC')
      .addOrderBy('lead.id', dto.sort === 'oldest' ? 'ASC' : 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [leads, total] = await qb.getManyAndCount();
    return { data: await this.rows(leads, settings, now), total, page, limit, overdueHours: settings.firstContactHours };
  }

  async summary(tenantId: number, viewer: BuyerViewer, dto: LeadReportQueryDto, now = new Date()): Promise<LeadReportSummary> {
    const settings = await this.settingsService.get(tenantId);
    const raw: { agentId: number | null; createdAt: Date; kind: string | null; firstContactAt: Date | null; reached: string | number }[] = await (
      await this.base(tenantId, viewer, dto, settings, now, false)
    )
      .select('lead.assignedTo', 'agentId')
      .addSelect('lead.createdAt', 'createdAt')
      .addSelect('stage.kind', 'kind')
      .addSelect(`(SELECT MIN(fa.createdAt) FROM lead_activities fa WHERE fa.leadId = lead.id AND ${attemptSql('fa')})`, 'firstContactAt')
      .addSelect(REACHED_EXISTS, 'reached')
      .getRawMany();

    // What each agent did on these leads.
    const ids = (await this.base(tenantId, viewer, dto, settings, now, false)).select('lead.id');
    const actions: { userId: number; calls: string; whatsapps: string; emails: string; viewings: string }[] = await this.db
      .createQueryBuilder()
      .select('a.userId', 'userId')
      .addSelect("SUM(a.type = 'call')", 'calls')
      .addSelect("SUM(a.type = 'whatsapp' OR (a.type = 'suggestion_sent' AND JSON_UNQUOTE(JSON_EXTRACT(a.metadata, '$.channel')) = 'whatsapp'))", 'whatsapps')
      .addSelect("SUM(a.type = 'email' OR (a.type = 'suggestion_sent' AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(a.metadata, '$.channel')), 'email') <> 'whatsapp'))", 'emails')
      .addSelect("SUM(a.type IN ('viewing', 'viewing_done'))", 'viewings')
      .from('lead_activities', 'a')
      .where(`a.leadId IN (${ids.getQuery()})`)
      .setParameters(ids.getParameters())
      .andWhere('a.userId IS NOT NULL')
      .groupBy('a.userId')
      .getRawMany();

    const leads = raw.map((r) => ({
      agentId: r.agentId === null ? null : Number(r.agentId),
      createdAt: r.createdAt,
      firstContactAt: r.firstContactAt,
      reached: Number(r.reached) === 1,
      won: r.kind === 'won',
    }));
    const acts = actions.map((a) => ({ userId: Number(a.userId), calls: Number(a.calls), whatsapps: Number(a.whatsapps), emails: Number(a.emails), viewings: Number(a.viewings) }));
    let agents = agentSummaries(leads, acts, now, settings.firstContactHours);
    // An agent sees only their own line (they may see a colleague's lead as
    // related agent, which would make a partial colleague line).
    if (!seesAllBuyers(viewer, false)) agents = agents.filter((a) => a.agentId === viewer.id);
    const [totals] = agentSummaries(
      leads.map((l) => ({ ...l, agentId: null })),
      acts.map((a) => ({ ...a, userId: null })),
      now,
      settings.firstContactHours,
    );

    const userIds = agents.map((a) => a.agentId).filter((id): id is number => !!id);
    const users: { id: number; name: string | null; email: string }[] = userIds.length
      ? await this.db.query('SELECT id, name, email FROM users WHERE tenantId = ? AND id IN (?)', [tenantId, userIds])
      : [];
    const empty: AgentSummary = { agentId: null, leads: 0, notContacted: 0, overdue: 0, contacted: 0, reached: 0, won: 0, medianFirstContactHours: null, calls: 0, whatsapps: 0, emails: 0, viewings: 0 };
    return {
      overdueHours: settings.firstContactHours,
      totals: totals ?? empty,
      agents: agents
        // Actions by someone outside the tenant (a Super Admin) are not an agent line.
        .filter((a) => a.agentId === null ? a.leads > 0 : users.some((u) => u.id === a.agentId))
        .map((a) => {
          const u = users.find((x) => x.id === a.agentId);
          return { ...a, name: u ? u.name || u.email : null };
        }),
    };
  }

  async exportCsv(tenantId: number, viewer: BuyerViewer, dto: LeadReportQueryDto, now = new Date()): Promise<{ filename: string; csv: string }> {
    const settings = await this.settingsService.get(tenantId);
    const leads = await this.selectRow(await this.base(tenantId, viewer, dto, settings, now))
      .orderBy('lead.createdAt', dto.sort === 'oldest' ? 'ASC' : 'DESC')
      .addOrderBy('lead.id', 'DESC')
      .take(EXPORT_LIMIT)
      .getMany();
    const rows = await this.rows(leads, settings, now);
    const en = (n: Record<string, string> | undefined) => (n ? n.en || Object.values(n).find(Boolean) || '' : '');
    const STATUS: Record<string, string> = {
      overdue: 'Not contacted (overdue)', not_contacted: 'Not contacted', tried: 'Tried, not reached',
      call_back: 'Call back', wrong_number: 'Wrong number', reached: 'Reached',
    };
    const time = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '');
    const header = [
      'ID', 'Name', 'Phone', 'Email', 'Agent', 'Stage', 'Follow-up', 'Calls', 'WhatsApps', 'Emails', 'Last call', 'Latest note',
      'Enquiry', 'Budget from', 'Budget to', 'Source', 'In New Leads', 'Created (UTC)', 'First contact (UTC)', 'Hours to first contact', 'Last contact (UTC)',
    ];
    const csvRows = rows.map((r) => [
      r.id, r.name, r.mobile || r.phone, r.email, r.agent?.name ?? '', r.stage ? en(r.stage.name) : '',
      STATUS[r.followUp.status], r.followUp.calls, r.followUp.whatsapps, r.followUp.emails, r.followUp.lastOutcome?.replace('_', ' ') ?? '',
      r.followUp.lastNote?.text ?? '', r.followUp.enquiry ?? '', r.budgetMin ?? '', r.budgetMax ?? '', r.source, r.isNewLead ? 'yes' : '',
      time(r.createdAt), time(r.followUp.firstContactAt), r.followUp.firstContactHours ?? '', time(r.followUp.lastContactAt),
    ]);
    return { filename: `lead-report-${now.toISOString().slice(0, 10)}.csv`, csv: toCsv(header, csvRows) };
  }
}
