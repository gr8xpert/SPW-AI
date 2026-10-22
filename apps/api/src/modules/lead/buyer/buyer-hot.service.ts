import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { HOT_WINDOW_DAYS, hotScore, type HotCounts } from './hot';

// Hot buyers (see hot.ts), counted in SQL over the last HOT_WINDOW_DAYS for
// the buyers asked about (or every buyer of the agency). Nothing is stored.
@Injectable()
export class BuyerHotService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async scores(tenantId: number, leadIds?: number[]): Promise<Map<number, number>> {
    if (leadIds && !leadIds.length) return new Map();
    const since = new Date(Date.now() - HOT_WINDOW_DAYS * 86_400_000);
    const only = leadIds ? 'AND e.leadId IN (?)' : '';
    const events: { leadId: number; opened: string; clicked: string; liked: string; pageViewing: string }[] = await this.db.query(
      `SELECT e.leadId,
         SUM(e.event = 'opened') AS opened, SUM(e.event = 'clicked') AS clicked,
         SUM(e.event = 'liked') AS liked, SUM(e.event = 'viewing' AND e.source = 'page') AS pageViewing
       FROM lead_suggestion_events e WHERE e.tenantId = ? AND e.createdAt >= ? ${only} GROUP BY e.leadId`,
      leadIds ? [tenantId, since, leadIds] : [tenantId, since],
    );
    const onlyA = leadIds ? 'AND a.leadId IN (?)' : '';
    const acts: { leadId: number; n: string }[] = await this.db.query(
      `SELECT a.leadId, COUNT(*) AS n FROM lead_activities a JOIN leads l ON l.id = a.leadId
       WHERE l.tenantId = ? AND a.type IN ('enquiry', 'wishlist_form') AND a.createdAt >= ? ${onlyA} GROUP BY a.leadId`,
      leadIds ? [tenantId, since, leadIds] : [tenantId, since],
    );
    const counts = new Map<number, HotCounts>();
    const get = (id: number) => counts.get(id) ?? (counts.set(id, { opened: 0, clicked: 0, liked: 0, pageViewing: 0, enquiries: 0 }), counts.get(id)!);
    for (const r of events) Object.assign(get(Number(r.leadId)), { opened: +r.opened, clicked: +r.clicked, liked: +r.liked, pageViewing: +r.pageViewing });
    for (const r of acts) get(Number(r.leadId)).enquiries = +r.n;

    // Won or lost buyers are never hot.
    const ids = [...counts.keys()];
    const closed = new Set<number>(
      ids.length
        ? (
            await this.db.query(
              `SELECT l.id FROM leads l JOIN buyer_stages s ON s.id = l.stageId WHERE l.id IN (?) AND s.kind IN ('won', 'lost')`,
              [ids],
            )
          ).map((r: { id: number }) => Number(r.id))
        : [],
    );
    const out = new Map<number, number>();
    for (const [id, c] of counts) if (!closed.has(id)) out.set(id, hotScore(c));
    return out;
  }

  async hotIds(tenantId: number, threshold: number, leadIds?: number[]): Promise<Set<number>> {
    const s = await this.scores(tenantId, leadIds);
    return new Set([...s].filter(([, v]) => v > 0 && v >= threshold).map(([id]) => id));
  }
}
