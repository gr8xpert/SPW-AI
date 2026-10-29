import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac, timingSafeEqual } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { PluginActivation, PluginCreditUsage, PluginLicense } from '../../database/entities';
import { hashPluginKey, normaliseSiteUrl, pluginPlan } from './plugin-plans';

// Licence API for SPM's WordPress plugins. Contract: polylang-ai-translation/docs/licensing-api.md.
// Errors use the platform's HttpException format; the plugin reads `code` and shows `message`.

export interface PluginLicenseView {
  status: 'active' | 'expired' | 'revoked' | 'inactive';
  plan: string;
  plan_label: string;
  sites_allowed: number;
  sites_used: number;
  expires_at: string | null;
  renew_url: string;
  credits: { words_allowed: number; words_used: number; resets_at: string } | null;
}

export interface PluginRelease {
  version: string;
  file: string;
  requires?: string;
  requires_php?: string;
  tested?: string;
  changelog_html?: string;
}

export function pluginError(status: HttpStatus, code: string, message: string): HttpException {
  return new HttpException({ message, error: HttpStatus[status] ?? 'Error', code }, status);
}

@Injectable()
export class PluginLicenseService {
  private readonly logger = new Logger(PluginLicenseService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(PluginLicense) private readonly licenses: Repository<PluginLicense>,
    @InjectRepository(PluginActivation) private readonly activations: Repository<PluginActivation>,
    @InjectRepository(PluginCreditUsage) private readonly usage: Repository<PluginCreditUsage>,
  ) {}

  /** The licence for a raw key, or 404 invalid_key. */
  async findByKey(rawKey: string): Promise<PluginLicense> {
    const license = rawKey ? await this.licenses.findOne({ where: { keyHash: hashPluginKey(rawKey) } }) : null;
    if (!license) {
      throw pluginError(HttpStatus.NOT_FOUND, 'invalid_key', 'This licence key does not exist. Copy it exactly from your purchase email.');
    }
    return license;
  }

  /** 403 when the licence can't be used (revoked, or past its paid period plus grace). */
  assertUsable(license: PluginLicense): void {
    if (license.status === 'revoked') {
      throw pluginError(HttpStatus.FORBIDDEN, 'revoked', 'This licence has been revoked. Contact RealtySoft support.');
    }
    if (license.status === 'expired' || (license.expiresAt && license.expiresAt.getTime() < Date.now())) {
      const on = license.expiresAt ? ` on ${license.expiresAt.toISOString().slice(0, 10)}` : '';
      throw pluginError(HttpStatus.FORBIDDEN, 'expired', `This licence expired${on}. Renew it to keep translating.`);
    }
  }

  async activate(rawKey: string, siteUrl: string, pluginVersion?: string): Promise<{ license: PluginLicenseView }> {
    const license = await this.findByKey(rawKey);
    this.assertUsable(license);
    const site = normaliseSiteUrl(siteUrl);
    if (!site) throw pluginError(HttpStatus.BAD_REQUEST, 'invalid_site', 'The site address is missing.');

    const existing = await this.activations.findOne({ where: { licenseId: license.id, siteUrl: site } });
    if (existing) {
      await this.activations.update(existing.id, { lastSeenAt: new Date(), pluginVersion: pluginVersion ?? existing.pluginVersion });
    } else {
      const used = await this.activations.count({ where: { licenseId: license.id } });
      if (used >= license.sitesAllowed) {
        const word = license.sitesAllowed === 1 ? 'activation' : 'activations';
        throw pluginError(
          HttpStatus.CONFLICT,
          'site_limit',
          `All ${license.sitesAllowed} ${word} of this licence are in use. Deactivate the plugin on another site first, or upgrade your plan.`,
        );
      }
      await this.activations.insert({ licenseId: license.id, siteUrl: site, pluginVersion: pluginVersion ?? null, lastSeenAt: new Date() });
    }
    return { license: await this.view(license, 'active') };
  }

  async deactivate(rawKey: string, siteUrl: string): Promise<{ ok: true }> {
    const license = await this.findByKey(rawKey);
    await this.activations.delete({ licenseId: license.id, siteUrl: normaliseSiteUrl(siteUrl) });
    return { ok: true };
  }

  /** Daily check: the licence object, `inactive` when this site isn't activated. */
  async check(rawKey: string, siteUrl: string, pluginVersion?: string): Promise<{ license: PluginLicenseView }> {
    const license = await this.findByKey(rawKey);
    this.assertUsable(license);
    const activation = await this.requireActivation(license, siteUrl, false);
    if (activation) {
      await this.activations.update(activation.id, { lastSeenAt: new Date(), pluginVersion: pluginVersion ?? activation.pluginVersion });
    }
    return { license: await this.view(license, activation ? 'active' : 'inactive') };
  }

  /** Usable licence that is activated on this site (403 inactive otherwise, when $strict). */
  async requireActivation(license: PluginLicense, siteUrl: string, strict = true): Promise<PluginActivation | null> {
    const activation = await this.activations.findOne({ where: { licenseId: license.id, siteUrl: normaliseSiteUrl(siteUrl) } });
    if (!activation && strict) {
      throw pluginError(HttpStatus.FORBIDDEN, 'inactive', 'This site is not activated for this licence. Activate it again in the plugin.');
    }
    return activation;
  }

  async view(license: PluginLicense, status: PluginLicenseView['status']): Promise<PluginLicenseView> {
    const plan = pluginPlan(license.plan);
    return {
      status,
      plan: license.plan,
      plan_label: plan?.label ?? license.plan,
      sites_allowed: license.sitesAllowed,
      sites_used: await this.activations.count({ where: { licenseId: license.id } }),
      expires_at: license.expiresAt ? license.expiresAt.toISOString() : null,
      renew_url: this.config.get<string>('PLUGIN_RENEW_URL') || 'https://realtysoft.eu/en/ai-translator-for-polylang/#pricing',
      credits: license.wordsAllowed ? await this.creditsView(license) : null,
    };
  }

  /** Current credit period: starts at the last renewal, resets one month later. */
  creditPeriod(license: PluginLicense): { start: Date; resets: Date } {
    // Copy (never mutate the entity's Date) and drop milliseconds: periodStart is a TIMESTAMP column.
    const start = new Date((license.creditsPeriodStart ?? license.createdAt ?? new Date()).getTime());
    start.setUTCMilliseconds(0);
    const resets = new Date(start);
    resets.setUTCMonth(resets.getUTCMonth() + 1);
    // A period that ended without a renewal event (e.g. delayed webhook) rolls forward month by month.
    const now = Date.now();
    while (resets.getTime() <= now) {
      start.setTime(resets.getTime());
      resets.setUTCMonth(resets.getUTCMonth() + 1);
    }
    return { start, resets };
  }

  async creditsView(license: PluginLicense): Promise<{ words_allowed: number; words_used: number; resets_at: string }> {
    const { start, resets } = this.creditPeriod(license);
    const row = await this.usage.findOne({ where: { licenseId: license.id, periodStart: start } });
    return { words_allowed: license.wordsAllowed ?? 0, words_used: row?.wordsUsed ?? 0, resets_at: resets.toISOString() };
  }

  /* ------------------------------------------------------------- Updates */

  private releasesDir(): string {
    return this.config.get<string>('PLUGIN_RELEASES_DIR') || join(process.cwd(), 'releases', 'plugins');
  }

  latestRelease(product: string): PluginRelease | null {
    const manifest = join(this.releasesDir(), product, 'latest.json');
    if (!existsSync(manifest)) return null;
    try {
      const release = JSON.parse(readFileSync(manifest, 'utf8')) as PluginRelease;
      return release?.version && release?.file ? release : null;
    } catch (err) {
      this.logger.error(`Invalid plugin release manifest ${manifest}: ${(err as Error).message}`);
      return null;
    }
  }

  async updateInfo(rawKey: string, siteUrl: string, pluginVersion: string): Promise<Record<string, unknown>> {
    const license = await this.findByKey(rawKey);
    this.assertUsable(license);
    await this.requireActivation(license, siteUrl);
    const release = this.latestRelease(license.product);
    if (!release || compareVersions(release.version, pluginVersion) <= 0) {
      return { version: release?.version ?? pluginVersion };
    }
    const token = this.signDownload(license.id, license.product, release.version);
    const base = (this.config.get<string>('PUBLIC_API_URL') || 'https://api.spw-ai.com').replace(/\/+$/, '');
    return {
      version: release.version,
      ...(token ? { download_url: `${base}/api/v1/plugin-license/download?t=${encodeURIComponent(token)}` } : {}),
      requires: release.requires ?? '',
      requires_php: release.requires_php ?? '',
      tested: release.tested ?? '',
      changelog_html: release.changelog_html ?? '',
    };
  }

  /** Signed, 10-minute download token: base64url(payload).hmac. Null when no secret is configured. */
  signDownload(licenseId: number, product: string, version: string, ttlSeconds = 600): string | null {
    const secret = this.config.get<string>('PLUGIN_DOWNLOAD_SECRET');
    if (!secret) {
      this.logger.warn('PLUGIN_DOWNLOAD_SECRET not set: plugin updates are offered without a download link');
      return null;
    }
    const payload = Buffer.from(JSON.stringify({ l: licenseId, p: product, v: version, e: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url');
    return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
  }

  /** Path of the release zip for a valid token, or 403. */
  async resolveDownload(token: string): Promise<{ path: string; filename: string }> {
    const secret = this.config.get<string>('PLUGIN_DOWNLOAD_SECRET');
    const [payload, sig] = String(token || '').split('.');
    const deny = pluginError(HttpStatus.FORBIDDEN, 'invalid_download', 'This download link is invalid or has expired. Check for updates again in WordPress.');
    if (!secret || !payload || !sig) throw deny;
    const expected = createHmac('sha256', secret).update(payload).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw deny;
    let data: { l: number; p: string; v: string; e: number };
    try {
      data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      throw deny;
    }
    if (!data?.e || data.e < Math.floor(Date.now() / 1000)) throw deny;
    const license = await this.licenses.findOne({ where: { id: data.l } });
    if (!license) throw deny;
    this.assertUsable(license);
    const release = this.latestRelease(data.p);
    if (!release || release.version !== data.v) throw deny;
    const path = join(this.releasesDir(), data.p, basename(release.file));
    if (!existsSync(path)) throw pluginError(HttpStatus.NOT_FOUND, 'missing_release', 'The release file is missing on the server.');
    return { path, filename: basename(release.file) };
  }
}

/** -1, 0 or 1 for dotted numeric versions (1.10.0 > 1.9.3). */
export function compareVersions(a: string, b: string): number {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}
