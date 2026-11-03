import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Not, Repository } from 'typeorm';
import type { TenantSettings } from '@spm/shared';
import { Property, SiteCheckin, Tenant } from '../../database/entities';
import { normalizeBuyerSettings } from '../lead/buyer/buyer-settings.service';
import { agencyHosts, onAgencySite } from '../lead/buyer/page/page-code';
import { propertyWebsiteLink, type WebsiteLinkContext } from './property-website-link';

// A plugin that has not checked in for this long is probably no longer there.
const PLUGIN_DAYS = 30;

@Injectable()
export class PropertyWebsiteLinkService {
  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(SiteCheckin) private readonly checkins: Repository<SiteCheckin>,
  ) {}

  // Adds websiteLink (null = address unknown) to each listing of a dashboard page.
  async attach(tenantId: number, rows: Property[]): Promise<Array<Property & { websiteLink: string | null }>> {
    const ctx = await this.context(tenantId);
    return rows.map((p) => Object.assign(p, { websiteLink: propertyWebsiteLink(p as never, ctx) }));
  }

  private async context(tenantId: number): Promise<WebsiteLinkContext> {
    const tenant = await this.tenants.findOne({ where: { id: tenantId }, select: ['id', 'domain', 'settings'] });
    const settings = (tenant?.settings || {}) as TenantSettings;
    return {
      lang: (settings.defaultLanguage || 'en').slice(0, 2),
      patterns: normalizeBuyerSettings(settings.buyerMatch).propertyUrlPatterns,
      slugFormat: (settings as { slugFormat?: unknown }).slugFormat,
      detailPageUrl: await this.pluginDetailPage(tenantId, tenant?.domain, settings.websiteUrl),
    };
  }

  // Only on the agency's own site: check-in headers come with the public
  // widget key, so anyone could otherwise point this link at another site.
  // The main key's site goes first when a client has sites on website keys too.
  private async pluginDetailPage(tenantId: number, domain?: string | null, websiteUrl?: string): Promise<string | null> {
    const hosts = agencyHosts(domain, websiteUrl);
    if (!hosts.size) return null;
    const rows = await this.checkins.find({
      where: {
        tenantId,
        source: 'plugin',
        detailPageUrl: Not(IsNull()),
        lastSeenAt: MoreThan(new Date(Date.now() - PLUGIN_DAYS * 86_400_000)),
      },
      order: { lastSeenAt: 'DESC' },
      take: 20,
    });
    const onSite = rows.filter((r) => onAgencySite(r.detailPageUrl, hosts));
    return (onSite.find((r) => r.apiKeyId === null) ?? onSite[0])?.detailPageUrl ?? null;
  }
}
