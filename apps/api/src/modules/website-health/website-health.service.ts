import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type HealthStatus = 'ok' | 'warning' | 'error' | 'info';

export interface HealthCheck {
  id: string;
  area: 'feeds' | 'website' | 'listings' | 'leads';
  status: HealthStatus;
  title: string;
  detail: string;
  action?: { label: string; href: string };
}

export interface FeedHealth {
  id: number;
  name: string;
  provider: string;
  isActive: boolean;
  status: HealthStatus;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastError: string | null;
  lastRun: {
    startedAt: string;
    completedAt: string | null;
    status: string;
    fetched: number;
    created: number;
    updated: number;
    removed: number;
    errors: number;
    errorSamples: Array<{ ref: string; error: string }>;
  } | null;
}

export interface SiteHealth {
  siteUrl: string;
  source: 'plugin' | 'widget';
  pluginVersion: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  status: HealthStatus;
}

export interface WebsiteHealthReport {
  generatedAt: string;
  overall: HealthStatus;
  checks: HealthCheck[];
  feeds: FeedHealth[];
  sites: SiteHealth[];
  activity: { views7d: number; searches7d: number; lastViewAt: string | null };
  listings: {
    published: number;
    noImages: number;
    noPrice: number;
    noLocation: number;
    noMapPosition: number;
    noDescription: number;
    noSeo: number;
  };
  leads: { new7d: number; waiting: number };
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const rank: Record<HealthStatus, number> = { error: 3, warning: 2, info: 1, ok: 0 };
const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);
const num = (v: unknown): number => Number(v ?? 0) || 0;

// One place that answers "is my website working?" for a client: feeds, the
// website connection, listing data quality and unanswered leads — each as a
// plain-language check with a link to where it can be fixed.
@Injectable()
export class WebsiteHealthService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async report(tenantId: number, now = Date.now()): Promise<WebsiteHealthReport> {
    const [feeds, sites, activity, listings, leads] = await Promise.all([
      this.feeds(tenantId, now),
      this.sites(tenantId, now),
      this.activity(tenantId),
      this.listings(tenantId),
      this.leads(tenantId),
    ]);

    const checks: HealthCheck[] = [];

    // ── Feeds ──
    const active = feeds.filter((f) => f.isActive);
    if (!feeds.length) {
      checks.push({ id: 'feeds', area: 'feeds', status: 'info', title: 'No property feed', detail: 'Properties are added by hand. Connect a feed (Resales, Kyero, …) to import them automatically.', action: { label: 'Feed sources', href: '/dashboard/feeds' } });
    }
    for (const f of active) {
      const when = f.lastSyncAt ? ago(now - new Date(f.lastSyncAt).getTime()) : 'never';
      const run = f.lastRun;
      const counts = run ? `${run.created} new, ${run.updated} updated, ${run.removed} removed${run.errors ? `, ${run.errors} with errors` : ''}` : '';
      const detail =
        f.status === 'error'
          ? `The last import failed (${when})${f.lastError ? `: ${f.lastError.slice(0, 200)}` : ''}.`
          : f.status === 'warning'
            ? !f.lastSyncAt
              ? 'This feed has never been imported.'
              : run?.status === 'partial'
                ? `Last import ${when} finished with problems: ${counts}.`
                : `Last import ${when} — it normally runs daily.`
            : `Imported ${when}: ${counts}.`;
      checks.push({ id: `feed-${f.id}`, area: 'feeds', status: f.status, title: `Feed: ${f.name}`, detail, action: f.status === 'ok' ? undefined : { label: 'Open feed', href: '/dashboard/feeds' } });
    }

    // ── Website ──
    const plugins = sites.filter((s) => s.source === 'plugin');
    const widgets = sites.filter((s) => s.source === 'widget');
    if (!sites.length) {
      checks.push({ id: 'website', area: 'website', status: 'warning', title: 'Website not connected yet', detail: 'No website has loaded your properties yet. Install the SPM WordPress plugin (or add the widget to your site) with your API key.' });
    } else {
      for (const s of plugins) {
        checks.push({
          id: `site-${s.siteUrl}`,
          area: 'website',
          status: s.status,
          title: `Website: ${s.siteUrl.replace(/^https?:\/\//, '')}`,
          detail:
            s.status === 'ok'
              ? `WordPress plugin ${s.pluginVersion ? `v${s.pluginVersion} ` : ''}connected ${ago(now - new Date(s.lastSeenAt).getTime())}.`
              : `The WordPress plugin last connected ${ago(now - new Date(s.lastSeenAt).getTime())}. Check the site is online and the plugin is active (SPM → Site Health in WordPress).`,
        });
      }
      if (!plugins.length) {
        const latest = widgets[0];
        checks.push({ id: 'site-widget', area: 'website', status: latest.status, title: `Website: ${latest.siteUrl.replace(/^https?:\/\//, '')}`, detail: `Your properties were last shown on this site ${ago(now - new Date(latest.lastSeenAt).getTime())}.` });
      }
    }
    if (sites.length && activity.views7d === 0 && listings.published > 0) {
      checks.push({ id: 'views', area: 'website', status: 'info', title: 'No property views this week', detail: 'Nobody opened a property page in the last 7 days. Check the property pages are linked from your site menu.' });
    }

    // ── Listings ──
    const pub = listings.published;
    const quality: Array<[keyof WebsiteHealthReport['listings'], string, string, HealthStatus]> = [
      ['noImages', 'without photos', 'Listings without photos get far fewer clicks.', 'warning'],
      ['noPrice', 'without a price', 'Set a price, or tick "Price on request".', 'warning'],
      ['noLocation', 'without a location', 'They can\'t be found by location search.', 'warning'],
      ['noMapPosition', 'not on the map', 'Their location has no map position yet.', 'info'],
      ['noDescription', 'without a description', 'Descriptions help visitors and search engines.', 'info'],
      ['noSeo', 'without SEO title & description', 'Use AI → Bulk SEO to fill them in one go.', 'info'],
    ];
    if (!pub) {
      checks.push({ id: 'listings', area: 'listings', status: 'warning', title: 'No published properties', detail: 'Nothing is shown on your website yet.', action: { label: 'Properties', href: '/dashboard/properties' } });
    } else {
      for (const [key, what, why, status] of quality) {
        const n = listings[key];
        if (n > 0) checks.push({ id: `listings-${key}`, area: 'listings', status, title: `${n} of ${pub} properties ${what}`, detail: why, action: { label: 'Properties', href: '/dashboard/properties' } });
      }
      if (!quality.some(([key]) => listings[key] > 0)) {
        checks.push({ id: 'listings', area: 'listings', status: 'ok', title: `${pub} published properties`, detail: 'All have photos, a price, a location and a description.' });
      }
    }

    // ── Leads ──
    if (leads.waiting > 0) {
      checks.push({ id: 'leads', area: 'leads', status: 'warning', title: `${leads.waiting} enquiries waiting over 2 days`, detail: 'They are still marked "New". A quick answer wins more deals.', action: { label: 'Leads', href: '/dashboard/leads' } });
    } else {
      checks.push({ id: 'leads', area: 'leads', status: 'ok', title: `${leads.new7d} new enquiries this week`, detail: 'None waiting for an answer.' });
    }

    const overall = checks.reduce<HealthStatus>((w, c) => (c.status !== 'info' && rank[c.status] > rank[w] ? c.status : w), 'ok');
    return { generatedAt: new Date(now).toISOString(), overall, checks, feeds, sites, activity, listings, leads };
  }

  private async feeds(tenantId: number, now: number): Promise<FeedHealth[]> {
    const configs: any[] = await this.db.query(
      `SELECT id, name, provider, isActive, lastSyncAt, lastSyncStatus, lastError FROM feed_configs WHERE tenantId = ? ORDER BY name`,
      [tenantId],
    );
    const out: FeedHealth[] = [];
    for (const c of configs) {
      const [run]: any[] = await this.db.query(
        `SELECT startedAt, completedAt, status, totalFetched, createdCount, updatedCount, removedCount, errorCount, errors
           FROM feed_import_logs WHERE tenantId = ? AND feedConfigId = ? ORDER BY startedAt DESC LIMIT 1`,
        [tenantId, c.id],
      );
      const isActive = !!Number(c.isActive);
      const lastSyncAt = iso(c.lastSyncAt);
      const age = lastSyncAt ? now - new Date(lastSyncAt).getTime() : Infinity;
      let status: HealthStatus = 'ok';
      if (!isActive) status = 'info';
      else if (c.lastSyncStatus === 'failed') status = 'error';
      else if (!lastSyncAt || age > 2 * DAY || c.lastSyncStatus === 'partial') status = 'warning';
      let errors: Array<{ ref: string; error: string }> = [];
      try {
        const parsed = typeof run?.errors === 'string' ? JSON.parse(run.errors) : run?.errors;
        if (Array.isArray(parsed)) errors = parsed.slice(0, 5).map((e: any) => ({ ref: String(e?.ref ?? ''), error: String(e?.error ?? '').slice(0, 300) }));
      } catch {
        /* keep empty */
      }
      out.push({
        id: c.id,
        name: c.name,
        provider: c.provider,
        isActive,
        status,
        lastSyncAt,
        lastSyncStatus: c.lastSyncStatus ?? null,
        lastError: c.lastError ?? null,
        lastRun: run
          ? {
              startedAt: iso(run.startedAt)!,
              completedAt: iso(run.completedAt),
              status: run.status,
              fetched: num(run.totalFetched),
              created: num(run.createdCount),
              updated: num(run.updatedCount),
              removed: num(run.removedCount),
              errors: num(run.errorCount),
              errorSamples: errors,
            }
          : null,
      });
    }
    return out;
  }

  private async sites(tenantId: number, now: number): Promise<SiteHealth[]> {
    const rows: any[] = await this.db.query(
      `SELECT siteUrl, source, pluginVersion, firstSeenAt, lastSeenAt FROM site_checkins WHERE tenantId = ? ORDER BY lastSeenAt DESC LIMIT 20`,
      [tenantId],
    );
    return rows.map((r) => {
      const age = now - new Date(r.lastSeenAt).getTime();
      // The plugin checks in every ~10 minutes while the site gets visits;
      // widget-only sites only when someone views them.
      const okWithin = r.source === 'plugin' ? 6 * HOUR : 3 * DAY;
      const status: HealthStatus = age <= okWithin ? 'ok' : age <= 7 * DAY ? 'warning' : 'error';
      return { siteUrl: r.siteUrl, source: r.source, pluginVersion: r.pluginVersion, firstSeenAt: iso(r.firstSeenAt)!, lastSeenAt: iso(r.lastSeenAt)!, status };
    });
  }

  private async activity(tenantId: number) {
    const [[views], [searches]]: any[] = await Promise.all([
      this.db.query(`SELECT COUNT(*) AS n, MAX(viewedAt) AS lastAt FROM property_views WHERE tenantId = ? AND viewedAt >= NOW() - INTERVAL 7 DAY`, [tenantId]),
      this.db.query(`SELECT COUNT(*) AS n FROM search_logs WHERE tenantId = ? AND searchedAt >= NOW() - INTERVAL 7 DAY`, [tenantId]),
    ]);
    const [last]: any[] = await this.db.query(`SELECT MAX(viewedAt) AS lastAt FROM property_views WHERE tenantId = ?`, [tenantId]);
    return { views7d: num(views?.n), searches7d: num(searches?.n), lastViewAt: iso(last?.lastAt) };
  }

  private async listings(tenantId: number) {
    const [r]: any[] = await this.db.query(
      `SELECT
         COUNT(*) AS published,
         SUM(p.images IS NULL OR JSON_LENGTH(p.images) = 0) AS noImages,
         SUM(p.price IS NULL AND p.priceOnRequest = 0) AS noPrice,
         SUM(p.locationId IS NULL) AS noLocation,
         SUM(p.lat IS NULL AND (l.lat IS NULL OR p.locationId IS NULL)) AS noMapPosition,
         SUM(p.description IS NULL OR JSON_LENGTH(p.description) = 0) AS noDescription,
         SUM(p.metaTitle IS NULL OR JSON_LENGTH(p.metaTitle) = 0 OR p.metaDescription IS NULL OR JSON_LENGTH(p.metaDescription) = 0) AS noSeo
       FROM properties p LEFT JOIN locations l ON l.id = p.locationId
       WHERE p.tenantId = ? AND p.status = 'active' AND p.isPublished = 1`,
      [tenantId],
    );
    return {
      published: num(r?.published),
      noImages: num(r?.noImages),
      noPrice: num(r?.noPrice),
      noLocation: num(r?.noLocation),
      noMapPosition: num(r?.noMapPosition),
      noDescription: num(r?.noDescription),
      noSeo: num(r?.noSeo),
    };
  }

  private async leads(tenantId: number) {
    const [r]: any[] = await this.db.query(
      `SELECT SUM(createdAt >= NOW() - INTERVAL 7 DAY) AS new7d,
              SUM(status = 'new' AND createdAt < NOW() - INTERVAL 2 DAY) AS waiting
         FROM leads WHERE tenantId = ?`,
      [tenantId],
    );
    return { new7d: num(r?.new7d), waiting: num(r?.waiting) };
  }
}

export function ago(ms: number): string {
  if (!Number.isFinite(ms)) return 'never';
  const min = Math.round(ms / 60_000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} minutes ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`;
  return `${Math.round(h / 24)} days ago`;
}
