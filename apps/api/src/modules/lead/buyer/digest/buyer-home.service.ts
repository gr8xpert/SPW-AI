import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { TenantSettings } from '@spm/shared';
import { normalizeBuyerSettings } from '../buyer-settings.service';
import { BuyerHotService } from '../buyer-hot.service';
import { localDayTime } from '../alerts/alert-rules';
import { BuyerViewingService, type ViewingItem } from '../viewings/buyer-viewing.service';
import { waitingForReply } from './agent-digest';

export interface HomeData {
  agentId: number;
  today: string;
  pipeline: { stageId: number | null; name: Record<string, string> | null; color: string | null; count: number }[];
  overdueTasks: HomeTask[];
  todayTasks: HomeTask[];
  viewings: ViewingItem[];
  waiting: { buyerId: number; buyer: string; since: string | null }[];
  hot: { buyerId: number; buyer: string; score: number }[];
  alertsToApprove: number;
}

export interface HomeTask {
  id: number;
  title: string;
  dueAt: Date;
  buyerId: number;
  buyer: string;
}

// The buyer types that mean "the buyer got in touch" vs "we did".
const FROM_BUYER = ['enquiry', 'wishlist_form', 'buyer_feedback', 'viewing_request'];
const FROM_AGENT = ['call', 'email', 'sms', 'meeting', 'viewing', 'suggestion_sent', 'alert_sent', 'note'];

const name = (r: { firstName: string | null; lastName: string | null; email?: string | null }) =>
  [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email || '—';

// "My day": one agent's buyers — pipeline, tasks, viewings, buyers waiting
// for a reply, hot buyers, alerts to approve. The daily email uses the same.
@Injectable()
export class BuyerHomeService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly hot: BuyerHotService,
    private readonly viewingService: BuyerViewingService,
  ) {}

  async home(tenantId: number, agentId: number, now = new Date(), viewingDays = 7): Promise<HomeData> {
    const tenant: { settings: string | TenantSettings | null }[] = await this.db.query('SELECT settings FROM tenants WHERE id = ?', [tenantId]);
    const settings = ((typeof tenant[0]?.settings === 'string' ? JSON.parse(tenant[0].settings) : tenant[0]?.settings) || {}) as TenantSettings;
    const tz = settings.timezone || 'UTC';
    const bm = normalizeBuyerSettings(settings.buyerMatch);
    const today = localDayTime(now, tz).day;
    // "Mine": main agent or related agent, not merged away or erased.
    const MINE = `l.tenantId = ? AND l.mergedIntoId IS NULL AND l.erasedAt IS NULL AND (l.assignedTo = ? OR EXISTS (SELECT 1 FROM lead_agents la WHERE la.leadId = l.id AND la.userId = ?))`;
    const mineArgs = [tenantId, agentId, agentId];

    const pipeline: { stageId: number | null; name: string | null; color: string | null; count: string }[] = await this.db.query(
      `SELECT l.stageId, s.name, s.color, COUNT(*) AS count FROM leads l LEFT JOIN buyer_stages s ON s.id = l.stageId
       WHERE ${MINE} GROUP BY l.stageId, s.name, s.color, s.sortOrder ORDER BY s.sortOrder`,
      mineArgs,
    );

    const tasks: { id: number; title: string; dueAt: Date; leadId: number; firstName: string | null; lastName: string | null }[] = await this.db.query(
      `SELECT t.id, t.title, t.dueAt, t.leadId, l.firstName, l.lastName FROM buyer_tasks t JOIN leads l ON l.id = t.leadId
       WHERE t.tenantId = ? AND t.assignedTo = ? AND t.doneAt IS NULL AND t.dueAt IS NOT NULL AND t.dueAt <= ? AND l.mergedIntoId IS NULL
       ORDER BY t.dueAt`,
      [tenantId, agentId, new Date(now.getTime() + 36 * 3_600_000)],
    );
    const taskItems = tasks.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt, buyerId: t.leadId, buyer: name(t), day: localDayTime(new Date(t.dueAt), tz).day }));

    // Viewings: this agent's (or, with nobody named, those of their buyers).
    const vIds: { id: number }[] = await this.db.query(
      `SELECT v.id FROM buyer_viewings v JOIN leads l ON l.id = v.leadId
       WHERE v.tenantId = ? AND v.status = 'planned' AND v.startsAt >= ? AND v.startsAt < ? AND l.mergedIntoId IS NULL
         AND (v.agentId = ? OR (v.agentId IS NULL AND l.assignedTo = ?)) ORDER BY v.startsAt`,
      // From two hours ago (one just started still shows) to viewingDays ahead.
      [tenantId, new Date(now.getTime() - 2 * 3_600_000), new Date(now.getTime() + viewingDays * 86_400_000), agentId, agentId],
    );
    const viewings = await this.viewingService.items(tenantId, vIds.map((r) => Number(r.id)), true);

    // Ordered by activity id: createdAt has second precision.
    const touch: { id: number; firstName: string | null; lastName: string | null; waitingReplyAt: string | null; lastBuyer: number | null; lastAgent: number | null; lastBuyerAt: Date | null; kind: string | null }[] = await this.db.query(
      `SELECT l.id, l.firstName, l.lastName, l.waitingReplyAt, s.kind,
         (SELECT MAX(a.id) FROM lead_activities a WHERE a.leadId = l.id AND a.type IN (?)) AS lastBuyer,
         (SELECT MAX(a.createdAt) FROM lead_activities a WHERE a.leadId = l.id AND a.type IN (?)) AS lastBuyerAt,
         (SELECT MAX(a.id) FROM lead_activities a WHERE a.leadId = l.id AND a.type IN (?) AND a.userId IS NOT NULL) AS lastAgent
       FROM leads l LEFT JOIN buyer_stages s ON s.id = l.stageId WHERE ${MINE}`,
      [FROM_BUYER, FROM_BUYER, FROM_AGENT, ...mineArgs],
    );
    const open = touch.filter((t) => t.kind !== 'won' && t.kind !== 'lost');
    const waiting = open
      .filter((t) =>
        waitingForReply({
          lastBuyer: t.lastBuyer ? Number(t.lastBuyer) : null,
          lastAgent: t.lastAgent ? Number(t.lastAgent) : null,
          waitingReplyAt: t.waitingReplyAt ? String(t.waitingReplyAt).slice(0, 10) : null,
          today,
        }),
      )
      .map((t) => ({ buyerId: t.id, buyer: name(t), since: t.lastBuyerAt ? localDayTime(new Date(t.lastBuyerAt), tz).day : t.waitingReplyAt ? String(t.waitingReplyAt).slice(0, 10) : null }))
      .sort((a, b) => String(a.since ?? '').localeCompare(String(b.since ?? '')));

    const scores = await this.hot.scores(tenantId, open.map((t) => t.id));
    const hot = open
      .filter((t) => (scores.get(t.id) ?? 0) >= bm.hotScore && (scores.get(t.id) ?? 0) > 0)
      .map((t) => ({ buyerId: t.id, buyer: name(t), score: Math.round((scores.get(t.id) ?? 0) * 10) / 10 }))
      .sort((a, b) => b.score - a.score);

    const alerts: { n: string }[] = await this.db.query(
      `SELECT COUNT(*) AS n FROM buyer_alerts a JOIN leads l ON l.id = a.leadId WHERE a.status = 'pending' AND ${MINE}`,
      mineArgs,
    );

    return {
      agentId,
      today,
      pipeline: pipeline.map((p) => ({
        stageId: p.stageId,
        name: typeof p.name === 'string' ? JSON.parse(p.name) : p.name,
        color: p.color,
        count: Number(p.count),
      })),
      overdueTasks: taskItems.filter((t) => t.day < today),
      todayTasks: taskItems.filter((t) => t.day === today),
      viewings,
      waiting,
      hot,
      alertsToApprove: Number(alerts[0]?.n ?? 0),
    };
  }
}
