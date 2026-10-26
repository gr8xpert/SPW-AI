import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { CalendarFeed } from '../../../../database/entities';
import { BuyerService } from '../buyer.service';
import { seesAllBuyers, type BuyerViewer } from '../buyer-access';
import { buildIcs, type IcsEvent } from './ics';

// Each user's private calendar link (.ics): Google Calendar, Outlook or
// Apple Calendar subscribe once and show the viewings (they refresh it in
// their own time, up to a day). An agent's link has their own viewings, a
// manager's every agent's (agent named in the title). Also one viewing as
// a download.

const PAST_DAYS = 60;
const AHEAD_DAYS = 365;

interface ViewingRow {
  id: number;
  leadId: number;
  title: string | null;
  startsAt: Date;
  durationMin: number;
  meetingPoint: string | null;
  status: string;
  updatedAt: Date;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  reference: string | null;
  propertyTitle: unknown;
  agentName: string | null;
}

const json = (v: unknown): Record<string, string> => {
  if (!v) return {};
  if (typeof v === 'object') return v as Record<string, string>;
  try {
    return JSON.parse(String(v)) as Record<string, string>;
  } catch {
    return {};
  }
};

@Injectable()
export class CalendarFeedService {
  constructor(
    @InjectRepository(CalendarFeed) private readonly feeds: Repository<CalendarFeed>,
    @InjectDataSource() private readonly db: DataSource,
    private readonly buyers: BuyerService,
    private readonly config: ConfigService,
  ) {}

  private feedUrl(token: string): string {
    return `${(this.config.get<string>('API_URL') || '').replace(/\/+$/, '')}/api/calendar/${token}.ics`;
  }

  async mine(tenantId: number, userId: number): Promise<{ url: string }> {
    let feed = await this.feeds.findOne({ where: { userId } });
    if (!feed || feed.tenantId !== tenantId) {
      await this.feeds.delete({ userId });
      feed = await this.feeds.save(this.feeds.create({ userId, tenantId, token: randomBytes(24).toString('hex') }));
    }
    return { url: this.feedUrl(feed.token) };
  }

  // A new link; the old one stops working (shared by mistake).
  async rotate(tenantId: number, userId: number): Promise<{ url: string }> {
    await this.feeds.delete({ userId });
    return this.mine(tenantId, userId);
  }

  private event(r: ViewingRow, dashboard: string, team = false): IcsEvent {
    const buyer = [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email || 'Buyer';
    const pt = json(r.propertyTitle);
    const what = r.reference ? `${r.reference}${pt.en || Object.values(pt)[0] ? ` — ${pt.en || Object.values(pt)[0]}` : ''}` : r.title || '';
    return {
      uid: `viewing-${r.id}@spm`,
      start: new Date(r.startsAt),
      durationMin: r.durationMin,
      title: `Viewing${team && r.agentName ? ` (${r.agentName})` : ''}: ${buyer}${what ? ` · ${what}` : ''}`,
      location: r.meetingPoint,
      description: [
        r.mobile || r.phone ? `Phone: ${r.mobile || r.phone}` : '',
        r.email ? `Email: ${r.email}` : '',
        dashboard ? `${dashboard}/dashboard/buyers/${r.leadId}` : '',
      ].filter(Boolean).join('\n') || null,
      cancelled: r.status === 'cancelled',
      updatedAt: new Date(r.updatedAt),
    };
  }

  private rows(where: string, params: unknown[]): Promise<ViewingRow[]> {
    return this.db.query(
      `SELECT v.id, v.leadId, v.title, v.startsAt, v.durationMin, v.meetingPoint, v.status, v.updatedAt,
              l.firstName, l.lastName, l.phone, l.mobile, c.email, p.reference, p.title AS propertyTitle,
              COALESCE(u.name, u.email) AS agentName
         FROM buyer_viewings v
         JOIN leads l ON l.id = v.leadId
         LEFT JOIN users u ON u.id = v.agentId
         LEFT JOIN contacts c ON c.id = l.contactId
         LEFT JOIN properties p ON p.id = v.propertyId
        WHERE ${where}
        ORDER BY v.startsAt`,
      params,
    );
  }

  // The public feed: null for an unknown token.
  async feed(token: string, now = new Date()): Promise<string | null> {
    if (!/^[0-9a-f]{48}$/.test(token)) return null;
    const feed = await this.feeds.findOne({ where: { token } });
    if (!feed) return null;
    const [user] = (await this.db.query('SELECT id, role, tenantId, isActive FROM users WHERE id = ?', [feed.userId])) as {
      id: number; role: string; tenantId: number; isActive: number | boolean;
    }[];
    // A deactivated user, or one now in another agency, loses the link (a
    // Super Admin's link stays with the agency it was made in).
    if (!user || !Number(user.isActive) || (user.role !== 'super_admin' && user.tenantId !== feed.tenantId)) return null;
    const team = seesAllBuyers({ id: user.id, role: user.role }, false);
    const range = [new Date(now.getTime() - PAST_DAYS * 86_400_000), new Date(now.getTime() + AHEAD_DAYS * 86_400_000)];
    const rows = await this.rows(
      `v.tenantId = ? ${team ? '' : 'AND v.agentId = ?'} AND v.status <> 'cancelled' AND l.mergedIntoId IS NULL AND l.erasedAt IS NULL AND v.startsAt BETWEEN ? AND ?`,
      team ? [feed.tenantId, ...range] : [feed.tenantId, feed.userId, ...range],
    );
    const dashboard = (this.config.get<string>('DASHBOARD_URL') || '').replace(/\/+$/, '');
    return buildIcs({ name: team ? 'Viewings (team)' : 'Viewings', events: rows.map((r) => this.event(r, dashboard, team)), now });
  }

  // One viewing the viewer may see, as a file to open in a calendar app.
  async one(tenantId: number, viewer: BuyerViewer, viewingId: number): Promise<string> {
    const [row] = await this.rows('v.tenantId = ? AND v.id = ?', [tenantId, viewingId]);
    if (!row) throw new NotFoundException('Viewing not found');
    await this.buyers.get(tenantId, viewer, row.leadId); // visibility
    const dashboard = (this.config.get<string>('DASHBOARD_URL') || '').replace(/\/+$/, '');
    return buildIcs({ name: 'Viewing', events: [this.event(row, dashboard)] });
  }
}
