import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

// Remembers which client websites talk to the API (see SiteCheckin). Writes
// at most once per site per 10 minutes and per process; failures never affect
// the request that triggered them.
const WRITE_EVERY_MS = 10 * 60_000;
const MAX_TRACKED = 5000;

export function normaliseSiteUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.protocol}//${url.host.toLowerCase()}${path}`.slice(0, 255);
}

@Injectable()
export class SiteCheckinService {
  private readonly logger = new Logger(SiteCheckinService.name);
  private readonly lastWrite = new Map<string, number>();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  record(tenantId: number, site: unknown, source: 'plugin' | 'widget', pluginVersion?: unknown): void {
    const siteUrl = normaliseSiteUrl(site);
    if (!siteUrl) return;
    // Our own pages (template gallery previews, demo) and local test copies are not client sites.
    if (/^https?:\/\/(localhost|127\.|\[::1\])/.test(siteUrl)) return;
    if (/^https?:\/\/(www\.)?spw-ai\.com(\/|$)/.test(siteUrl) || /^https?:\/\/dashboard\.spw-ai\.com/.test(siteUrl)) return;
    const version = typeof pluginVersion === 'string' && /^[\w.-]{1,20}$/.test(pluginVersion) ? pluginVersion : null;
    const key = `${tenantId}|${siteUrl}|${source}|${version ?? ''}`;
    const now = Date.now();
    if ((this.lastWrite.get(key) ?? 0) > now - WRITE_EVERY_MS) return;
    if (this.lastWrite.size > MAX_TRACKED) this.lastWrite.clear();
    this.lastWrite.set(key, now);
    this.dataSource
      .query(
        `INSERT INTO site_checkins (tenantId, siteUrl, source, pluginVersion, firstSeenAt, lastSeenAt)
         VALUES (?, ?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE lastSeenAt = NOW(), pluginVersion = COALESCE(VALUES(pluginVersion), pluginVersion)`,
        [tenantId, siteUrl, source, version],
      )
      .catch((err: Error) => this.logger.warn(`check-in not saved: ${err.message}`));
  }
}
