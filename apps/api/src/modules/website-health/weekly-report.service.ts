import { Injectable, Logger } from '@nestjs/common';
import { PLATFORM_TENANT_SLUG } from '../../common/platform-tenant';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SystemMailerService } from '../mail/system-mailer.service';
import { RedisLockService } from '../../common/redis/redis-lock.service';
import { escapeHtml } from '../../common/security/escape-html';
import { WebsiteHealthService, HealthCheck } from './website-health.service';

export interface WeeklyReportData {
  tenantId: number;
  company: string;
  color: string;
  period: { from: string; to: string };
  views: { now: number; before: number };
  searches: { now: number; before: number };
  enquiries: { now: number; before: number };
  topProperties: Array<{ reference: string; title: string; views: number }>;
  feed: { runs: number; failed: number; created: number; updated: number; removed: number };
  published: number;
  attention: HealthCheck[];
}

const DAY = 86_400_000;
const LOCK_KEY = 'cron:weekly-report';
const LOCK_TTL_MS = 30 * 60_000;
// A report is not sent twice within this window (restarts, a second instance).
const RESEND_AFTER_MS = 6 * DAY;

const num = (v: unknown) => Number(v ?? 0) || 0;
const pickTitle = (t: unknown): string => {
  if (typeof t === 'string') return t;
  if (t && typeof t === 'object') {
    const m = t as Record<string, string>;
    return m.en || Object.values(m).find((v) => typeof v === 'string' && v) || '';
  }
  return '';
};

// Monday-morning email to each client: last week's views, searches and
// enquiries (with the week before for comparison), top properties, what the
// feed imported, and anything on the Website Health page that needs them.
// Clients turn it off or choose recipients in Settings → Notifications.
@Injectable()
export class WeeklyReportService {
  private readonly logger = new Logger(WeeklyReportService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly health: WebsiteHealthService,
    private readonly mailer: SystemMailerService,
    private readonly lock: RedisLockService,
    private readonly config: ConfigService,
  ) {}

  @Cron('0 7 * * 1')
  async sendAll(): Promise<void> {
    const outcome = await this.lock.withLock(LOCK_KEY, LOCK_TTL_MS, () => this.runAll());
    if (outcome.acquired && outcome.result) this.logger.log(`weekly reports: ${outcome.result.sent} sent, ${outcome.result.skipped} skipped`);
  }

  async runAll(now = Date.now()): Promise<{ sent: number; skipped: number }> {
    const tenants: any[] = await this.db.query(
      `SELECT t.id, t.settings FROM tenants t
        WHERE t.isActive = 1
          AND t.slug != ?
          AND (EXISTS (SELECT 1 FROM properties p WHERE p.tenantId = t.id AND p.isPublished = 1)
               OR EXISTS (SELECT 1 FROM feed_configs f WHERE f.tenantId = t.id AND f.isActive = 1))`,
      [PLATFORM_TENANT_SLUG],
    );
    let sent = 0;
    let skipped = 0;
    for (const t of tenants) {
      const settings = parseJson(t.settings);
      const last = Date.parse(settings.weeklyReportLastSentAt || '');
      if (settings.weeklyReportEnabled === false || (Number.isFinite(last) && now - last < RESEND_AFTER_MS)) {
        skipped++;
        continue;
      }
      try {
        const to = await this.recipients(t.id, settings);
        if (!to.length) {
          skipped++;
          continue;
        }
        const data = await this.build(t.id, now);
        for (const address of to) await this.send(address, data);
        await this.db.query(
          `UPDATE tenants SET settings = JSON_SET(COALESCE(settings, JSON_OBJECT()), '$.weeklyReportLastSentAt', ?) WHERE id = ?`,
          [new Date(now).toISOString(), t.id],
        );
        sent++;
      } catch (err) {
        skipped++;
        this.logger.warn(`weekly report for tenant ${t.id} failed: ${(err as Error).message}`);
      }
    }
    return { sent, skipped };
  }

  /** Settings → Notifications recipients, else the client's admins, else the owner. */
  async recipients(tenantId: number, settings?: Record<string, any>): Promise<string[]> {
    const s = settings ?? parseJson((await this.db.query(`SELECT settings FROM tenants WHERE id = ?`, [tenantId]))[0]?.settings);
    const valid = (e: unknown): e is string => typeof e === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
    const chosen = Array.isArray(s.weeklyReportEmails) ? s.weeklyReportEmails.filter(valid) : [];
    if (chosen.length) return [...new Set<string>(chosen)].slice(0, 10);
    const admins: any[] = await this.db.query(
      `SELECT email FROM users WHERE tenantId = ? AND role = 'admin' AND isActive = 1 ORDER BY id LIMIT 5`,
      [tenantId],
    );
    const list = admins.map((a) => a.email).filter(valid);
    if (list.length) return list;
    const [owner]: any[] = await this.db.query(`SELECT ownerEmail FROM tenants WHERE id = ?`, [tenantId]);
    return valid(owner?.ownerEmail) ? [owner.ownerEmail] : [];
  }

  async build(tenantId: number, now = Date.now()): Promise<WeeklyReportData> {
    const to = new Date(now);
    const from = new Date(now - 7 * DAY);
    const before = new Date(now - 14 * DAY);
    const range = [before, from, from, to];
    const [[views], [searches], [enquiries], top, [feed], [tenant], report] = await Promise.all([
      this.db.query(`SELECT SUM(viewedAt >= ? AND viewedAt < ?) AS b, SUM(viewedAt >= ? AND viewedAt < ?) AS n FROM property_views WHERE tenantId = ? AND viewedAt >= ?`, [...range, tenantId, before]),
      this.db.query(`SELECT SUM(searchedAt >= ? AND searchedAt < ?) AS b, SUM(searchedAt >= ? AND searchedAt < ?) AS n FROM search_logs WHERE tenantId = ? AND searchedAt >= ?`, [...range, tenantId, before]),
      this.db.query(`SELECT SUM(createdAt >= ? AND createdAt < ?) AS b, SUM(createdAt >= ? AND createdAt < ?) AS n FROM leads WHERE tenantId = ? AND createdAt >= ?`, [...range, tenantId, before]),
      this.db.query(
        `SELECT p.reference, p.title, COUNT(*) AS views FROM property_views v JOIN properties p ON p.id = v.propertyId
          WHERE v.tenantId = ? AND v.viewedAt >= ? AND v.viewedAt < ? GROUP BY p.id, p.reference, p.title ORDER BY views DESC LIMIT 5`,
        [tenantId, from, to],
      ),
      this.db.query(
        `SELECT COUNT(*) AS runs, SUM(status = 'failed') AS failed, SUM(createdCount) AS created, SUM(updatedCount) AS updated, SUM(removedCount) AS removed
           FROM feed_import_logs WHERE tenantId = ? AND startedAt >= ? AND startedAt < ?`,
        [tenantId, from, to],
      ),
      this.db.query(`SELECT name, settings FROM tenants WHERE id = ?`, [tenantId]),
      this.health.report(tenantId, now),
    ]);
    const settings = parseJson(tenant?.settings);
    const color = /^#[0-9a-f]{6}$/i.test(settings.primaryColor || '') ? settings.primaryColor : '#2563eb';
    return {
      tenantId,
      company: settings.companyName || tenant?.name || 'your agency',
      color,
      period: { from: from.toISOString(), to: to.toISOString() },
      views: { now: num(views?.n), before: num(views?.b) },
      searches: { now: num(searches?.n), before: num(searches?.b) },
      enquiries: { now: num(enquiries?.n), before: num(enquiries?.b) },
      topProperties: (top as any[]).map((r) => ({ reference: r.reference, title: pickTitle(parseJson(r.title, r.title)), views: num(r.views) })),
      feed: { runs: num(feed?.runs), failed: num(feed?.failed), created: num(feed?.created), updated: num(feed?.updated), removed: num(feed?.removed) },
      published: report.listings.published,
      attention: report.checks.filter((c) => c.status === 'error' || c.status === 'warning'),
    };
  }

  async send(to: string, data: WeeklyReportData): Promise<void> {
    const dashboard = (this.config.get<string>('DASHBOARD_URL') || 'https://dashboard.spw-ai.com').replace(/\/$/, '');
    const { html, text, subject } = renderWeeklyReport(data, dashboard);
    await this.mailer.send({ to, subject, html, text });
  }
}

function parseJson(v: unknown, fallback: any = {}): any {
  if (v && typeof v === 'object') return v;
  if (typeof v !== 'string') return fallback;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

function trend(now: number, before: number): string {
  if (!before) return now ? 'new this week' : '';
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return 'same as last week';
  return `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs last week`;
}

export function renderWeeklyReport(d: WeeklyReportData, dashboardUrl: string) {
  const e = escapeHtml;
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const period = `${fmt(d.period.from)} – ${fmt(d.period.to)}`;
  const subject = `Your week on the website: ${d.views.now} property views, ${d.enquiries.now} enquiries`;
  const stat = (label: string, s: { now: number; before: number }) =>
    `<td style="padding:14px;border:1px solid #e2e8f0;border-radius:8px;text-align:center;width:33%">
       <div style="font-size:26px;font-weight:700;color:${d.color}">${s.now}</div>
       <div style="font-size:13px;color:#475569">${label}</div>
       <div style="font-size:12px;color:#94a3b8">${e(trend(s.now, s.before))}</div></td>`;
  const top = d.topProperties.length
    ? d.topProperties.map((p) => `<tr><td style="padding:6px 0">${e(p.title || p.reference)} <span style="color:#94a3b8">(${e(p.reference)})</span></td><td style="padding:6px 0;text-align:right;white-space:nowrap">${p.views} views</td></tr>`).join('')
    : '<tr><td style="padding:6px 0;color:#64748b">No property was viewed this week.</td></tr>';
  const feed = d.feed.runs
    ? `${d.feed.created} new, ${d.feed.updated} updated and ${d.feed.removed} removed listings across ${d.feed.runs} imports${d.feed.failed ? ` — <b style="color:#b91c1c">${d.feed.failed} import(s) failed</b>` : ''}.`
    : 'No feed imports this week.';
  const attention = d.attention.length
    ? `<h3 style="font-size:15px;margin:24px 0 8px">Needs your attention</h3><ul style="padding-left:18px;margin:0">${d.attention
        .map((c) => `<li style="margin-bottom:6px"><b>${e(c.title)}</b> — ${e(c.detail)}</li>`)
        .join('')}</ul>`
    : '<p style="margin:24px 0 0;color:#15803d">✔ Everything on your website is working.</p>';

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1e293b">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
  <div style="background:${d.color};color:#fff;border-radius:12px 12px 0 0;padding:20px 24px">
    <div style="font-size:13px;opacity:.85">${e(period)}</div>
    <div style="font-size:20px;font-weight:700">${e(d.company)} — your week</div>
  </div>
  <div style="background:#fff;border-radius:0 0 12px 12px;padding:24px">
    <table role="presentation" style="width:100%;border-collapse:separate;border-spacing:8px 0"><tr>
      ${stat('property views', d.views)}${stat('searches', d.searches)}${stat('enquiries', d.enquiries)}
    </tr></table>
    <h3 style="font-size:15px;margin:24px 0 8px">Most viewed properties</h3>
    <table role="presentation" style="width:100%;font-size:14px;border-collapse:collapse">${top}</table>
    <h3 style="font-size:15px;margin:24px 0 8px">Property feed</h3>
    <p style="margin:0;font-size:14px">${feed} ${d.published} properties are live on your website.</p>
    ${attention}
    <p style="margin:28px 0 0"><a href="${e(dashboardUrl)}/dashboard/website-health" style="background:${d.color};color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;display:inline-block">Open your dashboard</a></p>
  </div>
  <p style="font-size:12px;color:#94a3b8;text-align:center;margin-top:16px">Sent every Monday by Smart Property Manager. Change who receives it, or turn it off, in <a href="${e(dashboardUrl)}/dashboard/settings" style="color:#64748b">Settings → Notifications</a>.</p>
</div></body></html>`;

  const text = [
    `${d.company} — your week (${period})`,
    '',
    `Property views: ${d.views.now} (${trend(d.views.now, d.views.before) || '-'})`,
    `Searches: ${d.searches.now} (${trend(d.searches.now, d.searches.before) || '-'})`,
    `Enquiries: ${d.enquiries.now} (${trend(d.enquiries.now, d.enquiries.before) || '-'})`,
    '',
    'Most viewed properties:',
    ...(d.topProperties.length ? d.topProperties.map((p) => `- ${p.title || p.reference} (${p.reference}): ${p.views} views`) : ['- none this week']),
    '',
    `Property feed: ${d.feed.runs ? `${d.feed.created} new, ${d.feed.updated} updated, ${d.feed.removed} removed in ${d.feed.runs} imports${d.feed.failed ? `, ${d.feed.failed} failed` : ''}` : 'no imports this week'}.`,
    `${d.published} properties are live on your website.`,
    '',
    ...(d.attention.length ? ['Needs your attention:', ...d.attention.map((c) => `- ${c.title}: ${c.detail}`)] : ['Everything on your website is working.']),
    '',
    `Dashboard: ${dashboardUrl}/dashboard/website-health`,
    `Turn this email off in Settings → Notifications: ${dashboardUrl}/dashboard/settings`,
  ].join('\n');

  return { subject, html, text };
}
