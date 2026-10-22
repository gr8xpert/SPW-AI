import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { TenantSettings } from '@spm/shared';
import { BuyerAlert, LeadSuggestion, Tenant, type BuyerAlertKind } from '../../../../database/entities';
import { applyVisibility, type BuyerViewer } from '../buyer-access';
import { BuyerSettingsService, normalizeBuyerSettings } from '../buyer-settings.service';
import { BuyerMatchService } from '../buyer-match.service';
import { BuyerReverseService } from '../buyer-reverse.service';
import { BuyerSendService } from '../buyer-send.service';
import type { BuyerPropertyCard } from '../buyer-property-card';
import { alertAllowed, alertDedupeKey, digestDue, priceDropOf } from './alert-rules';

// Changed listings handled per scan; the rest wait for the next one.
const SCAN_BATCH = 2000;
const PAGE = 50;

export interface ScanResult {
  seeded: number;
  checked: number;
  newListings: number;
  priceDrops: number;
  alerts: number;
}

export interface AlertItem {
  id: number;
  kind: BuyerAlertKind;
  status: BuyerAlert['status'];
  oldPrice: number | null;
  newPrice: number | null;
  score: number;
  createdAt: Date;
  decidedAt: Date | null;
  sentAt: Date | null;
  buyer: { id: number; name: string | null; email: string | null; agent: string | null };
  property: BuyerPropertyCard | null;
}

export interface DecideResult {
  updated: number;
  sent: number;
  skipped: number;
}

// New-listing and price-drop alerts. A scan (every 10 minutes, BullMQ)
// finds listings that are new or cheaper and queues an alert for each
// matching buyer; the agent approves or rejects each one; approved alerts
// go out in the daily digest (or at once). Nothing is kept in memory.
@Injectable()
export class BuyerAlertService {
  private readonly logger = new Logger(BuyerAlertService.name);

  constructor(
    @InjectRepository(BuyerAlert) private readonly alerts: Repository<BuyerAlert>,
    @InjectRepository(LeadSuggestion) private readonly suggestions: Repository<LeadSuggestion>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly settingsService: BuyerSettingsService,
    private readonly reverse: BuyerReverseService,
    private readonly sender: BuyerSendService,
    private readonly matchService: BuyerMatchService,
  ) {}

  private q<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T> {
    return this.alerts.manager.query(sql, params);
  }

  // Agencies with Buyer Match switched on.
  private async buyerMatchTenants(): Promise<Tenant[]> {
    return this.tenants
      .createQueryBuilder('t')
      .select(['t.id', 't.settings'])
      .where('t.isActive = 1')
      .andWhere("JSON_EXTRACT(t.dashboardAddons, '$.buyerMatch') = true")
      .getMany();
  }

  async scanAll(): Promise<number> {
    let alerts = 0;
    for (const t of await this.buyerMatchTenants()) {
      try {
        alerts += (await this.scanTenant(t.id)).alerts;
      } catch (err) {
        this.logger.warn(`Alert scan failed for tenant ${t.id}: ${(err as Error).message}`);
      }
    }
    return alerts;
  }

  // Compares live listings with the last price the scanner saw. With alerts
  // off it only keeps the prices current (so switching on later never
  // floods the queue); the very first run only records them.
  async scanTenant(tenantId: number): Promise<ScanResult> {
    const out: ScanResult = { seeded: 0, checked: 0, newListings: 0, priceDrops: 0, alerts: 0 };
    const settings = await this.settingsService.get(tenantId);
    const known = Number((await this.q<{ n: string }[]>('SELECT COUNT(*) AS n FROM buyer_alert_prices WHERE tenantId = ?', [tenantId]))[0]?.n ?? 0);
    if (!known) {
      const res = await this.q<{ affectedRows: number }>(
        `INSERT IGNORE INTO buyer_alert_prices (propertyId, tenantId, price, seenAt)
         SELECT id, tenantId, IF(priceOnRequest = 1, NULL, NULLIF(price, 0)), NOW() FROM properties
         WHERE tenantId = ? AND status = 'active' AND isPublished = 1`,
        [tenantId],
      );
      out.seeded = res.affectedRows ?? 0;
      return out;
    }

    const rows = await this.q<{ id: number; price: string | null; lastPrice: string | null; isNew: number }[]>(
      `SELECT p.id, IF(p.priceOnRequest = 1, NULL, NULLIF(p.price, 0)) AS price, bap.price AS lastPrice, bap.propertyId IS NULL AS isNew
       FROM properties p LEFT JOIN buyer_alert_prices bap ON bap.propertyId = p.id
       WHERE p.tenantId = ? AND p.status = 'active' AND p.isPublished = 1
         AND (bap.propertyId IS NULL OR NOT (bap.price <=> IF(p.priceOnRequest = 1, NULL, NULLIF(p.price, 0))))
       ORDER BY p.id LIMIT ${SCAN_BATCH}`,
      [tenantId],
    );
    out.checked = rows.length;
    for (const r of rows) {
      const isNew = Number(r.isNew) === 1;
      const drop = isNew ? null : priceDropOf(r.lastPrice, r.price, settings.alerts.priceDropPercent);
      await this.q(
        `INSERT INTO buyer_alert_prices (propertyId, tenantId, price, seenAt) VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE price = VALUES(price), seenAt = NOW()`,
        [r.id, tenantId, r.price],
      );
      if (!settings.alerts.enabled || (!isNew && !drop)) continue;
      const kind: BuyerAlertKind = isNew ? 'new_listing' : 'price_drop';
      if (isNew) out.newListings++;
      else out.priceDrops++;
      out.alerts += await this.queueFor(tenantId, Number(r.id), kind, drop);
    }
    return out;
  }

  // An alert for every open buyer the listing matches, unless the rules
  // say no (sent / rejected) or it was queued before (dedupe key).
  private async queueFor(tenantId: number, propertyId: number, kind: BuyerAlertKind, drop: { oldPrice: number; newPrice: number } | null): Promise<number> {
    const match = await this.reverse.forProperty(tenantId, null, propertyId);
    const rows = match.buyers
      .filter((b) => alertAllowed(kind, { sentAt: b.sent ? new Date() : null, rejectedAt: b.rejected ? new Date() : null, status: b.rejected ? 'not_interested' : 'sent' }))
      .map((b) => ({
        tenantId,
        leadId: b.id,
        propertyId,
        kind,
        oldPrice: drop ? String(drop.oldPrice) : null,
        newPrice: drop ? String(drop.newPrice) : null,
        score: b.score,
        status: 'pending' as const,
        dedupeKey: alertDedupeKey(b.id, propertyId, kind, drop?.newPrice),
      }));
    if (!rows.length) return 0;
    const res = await this.alerts.createQueryBuilder().insert().values(rows).orIgnore().updateEntity(false).execute();
    return (res.raw as { affectedRows?: number })?.affectedRows ?? rows.length;
  }

  // ── The approval screen ────────────────────────────────────────────────

  async list(tenantId: number, viewer: BuyerViewer, status: BuyerAlert['status'] = 'pending', page = 1): Promise<{ data: AlertItem[]; total: number; page: number; pendingCount: number }> {
    const { agentsSeeAll } = await this.settingsService.get(tenantId);
    const base = () => {
      const qb = this.alerts
        .createQueryBuilder('a')
        .innerJoin('a.lead', 'lead')
        .where('a.tenantId = :tenantId', { tenantId })
        .andWhere('lead.mergedIntoId IS NULL');
      applyVisibility(qb, viewer, agentsSeeAll);
      return qb;
    };
    const pendingCount = await base().andWhere("a.status = 'pending'").getCount();
    const qb = base()
      .andWhere('a.status = :status', { status })
      .leftJoin('lead.contact', 'contact')
      .leftJoin('lead.assignedToUser', 'agent')
      .addSelect(['lead.id', 'lead.firstName', 'lead.lastName', 'contact.id', 'contact.email', 'agent.id', 'agent.name'])
      .orderBy('a.leadId', 'DESC')
      .addOrderBy('a.id', 'DESC');
    const [rows, total] = await qb.skip((page - 1) * PAGE).take(PAGE).getManyAndCount();
    const cards = await this.matchService.cards(tenantId, [...new Set(rows.map((r) => r.propertyId))]);
    const num = (v: string | null) => (v === null ? null : Number(v));
    return {
      data: rows.map((a) => ({
        id: a.id,
        kind: a.kind,
        status: a.status,
        oldPrice: num(a.oldPrice),
        newPrice: num(a.newPrice),
        score: a.score,
        createdAt: a.createdAt,
        decidedAt: a.decidedAt,
        sentAt: a.sentAt,
        buyer: {
          id: a.leadId,
          name: [a.lead?.firstName, a.lead?.lastName].filter(Boolean).join(' ') || null,
          email: a.lead?.contact?.email ?? null,
          agent: a.lead?.assignedToUser?.name ?? null,
        },
        property: cards.get(a.propertyId) ?? null,
      })),
      total,
      page,
      pendingCount,
    };
  }

  async decide(tenantId: number, viewer: BuyerViewer, ids: number[], action: 'approve' | 'reject' | 'send_now'): Promise<DecideResult> {
    const { agentsSeeAll, alerts: cfg } = await this.settingsService.get(tenantId);
    const qb = this.alerts
      .createQueryBuilder('a')
      .innerJoin('a.lead', 'lead')
      .where('a.tenantId = :tenantId', { tenantId })
      .andWhere('a.id IN (:...ids)', { ids })
      .andWhere('a.status IN (:...open)', { open: action === 'send_now' ? ['pending', 'approved'] : ['pending'] });
    applyVisibility(qb, viewer, agentsSeeAll);
    const rows = await qb.getMany();
    if (!rows.length) return { updated: 0, sent: 0, skipped: 0 };
    const chosen = rows.map((r) => r.id);
    const now = new Date();
    if (action === 'reject') {
      await this.alerts.update({ id: In(chosen), tenantId }, { status: 'rejected', decidedBy: viewer.id, decidedAt: now });
      return { updated: chosen.length, sent: 0, skipped: 0 };
    }
    await this.alerts.update({ id: In(chosen), tenantId, status: 'pending' }, { status: 'approved', decidedBy: viewer.id, decidedAt: now });
    if (action === 'approve' && cfg.delivery !== 'instant') return { updated: chosen.length, sent: 0, skipped: 0 };
    const sent = await this.sendApproved(tenantId, viewer.id, chosen);
    return { updated: chosen.length, ...sent };
  }

  // Sends approved alerts, one email per buyer. Each is checked again first:
  // still live, not rejected meanwhile, a new listing not sent since.
  async sendApproved(tenantId: number, userId: number | null, ids?: number[]): Promise<{ sent: number; skipped: number }> {
    const where = { tenantId, status: 'approved' as const, ...(ids ? { id: In(ids) } : {}) };
    const rows = await this.alerts.find({ where, order: { id: 'ASC' } });
    const byLead = new Map<number, BuyerAlert[]>();
    for (const r of rows) byLead.set(r.leadId, [...(byLead.get(r.leadId) ?? []), r]);
    let sent = 0;
    let skipped = 0;
    for (const [leadId, list] of byLead) {
      const states = await this.suggestions.find({ where: { tenantId, leadId, propertyId: In(list.map((a) => a.propertyId)) } });
      const state = new Map(states.map((s) => [s.propertyId, s]));
      const ok = list.filter((a) => alertAllowed(a.kind, state.get(a.propertyId) ?? null));
      const dropped = list.filter((a) => !ok.includes(a));
      if (dropped.length) {
        await this.alerts.update({ id: In(dropped.map((a) => a.id)) }, { status: 'skipped' });
        skipped += dropped.length;
      }
      if (!ok.length) continue;
      try {
        const res = await this.sender.sendAlert(
          tenantId,
          userId,
          leadId,
          ok.map((a) => ({ propertyId: a.propertyId, oldPrice: a.kind === 'price_drop' && a.oldPrice ? Number(a.oldPrice) : null })),
        );
        const went = ok.filter((a) => res.propertyIds.includes(a.propertyId));
        const gone = ok.filter((a) => !res.propertyIds.includes(a.propertyId));
        if (went.length) await this.alerts.update({ id: In(went.map((a) => a.id)) }, { status: 'sent', sentAt: new Date(), sendId: res.sendId });
        if (gone.length) await this.alerts.update({ id: In(gone.map((a) => a.id)) }, { status: 'skipped' });
        sent += went.length;
        skipped += gone.length;
      } catch (err) {
        const code = err instanceof HttpException ? (err.getResponse() as { code?: string })?.code : undefined;
        if (code === 'NO_RECIPIENT' || code === 'NOT_FOUND' || (err as { status?: number }).status === 404) {
          await this.alerts.update({ id: In(ok.map((a) => a.id)) }, { status: 'skipped' });
          skipped += ok.length;
        } else {
          // Stays approved: the next digest tries again.
          this.logger.warn(`Alert email for buyer ${leadId} failed: ${(err as Error).message}`);
        }
      }
    }
    return { sent, skipped };
  }

  // ── The daily digest ───────────────────────────────────────────────────

  async digestAll(now = new Date()): Promise<number> {
    let sent = 0;
    for (const t of await this.buyerMatchTenants()) {
      try {
        sent += (await this.digestTenant(t.id, now)).sent;
      } catch (err) {
        this.logger.warn(`Alert digest failed for tenant ${t.id}: ${(err as Error).message}`);
      }
    }
    return sent;
  }

  // Once a day per agency, at its digest time in its time zone. The claim
  // row decides which process sends (INSERT IGNORE: only one insert lands).
  async digestTenant(tenantId: number, now = new Date()): Promise<{ due: boolean; claimed: boolean; sent: number; skipped: number }> {
    const tenant = await this.tenants.findOne({ where: { id: tenantId }, select: ['id', 'settings'] });
    if (!tenant) throw new BadRequestException('Unknown tenant');
    const settings = (tenant.settings || {}) as TenantSettings;
    const { alerts } = normalizeBuyerSettings(settings.buyerMatch);
    if (!alerts.enabled) return { due: false, claimed: false, sent: 0, skipped: 0 };
    const { due, day } = digestDue(now, settings.timezone || 'UTC', alerts.digestTime);
    if (!due) return { due, claimed: false, sent: 0, skipped: 0 };
    const res = await this.q<{ affectedRows: number }>("INSERT IGNORE INTO buyer_alert_runs (tenantId, kind, day) VALUES (?, 'digest', ?)", [tenantId, day]);
    if (!res.affectedRows) return { due, claimed: false, sent: 0, skipped: 0 };
    return { due, claimed: true, ...(await this.sendApproved(tenantId, null)) };
  }
}
