import { Controller, Get, Headers, Query, UnauthorizedException, UseGuards, SetMetadata } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Property } from '../../database/entities';
import { TenantService } from '../tenant/tenant.service';
import { IS_PUBLIC_KEY } from '../../common/guards/jwt-auth.guard';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';
import { propertyUrlSegment, slugifyTitle } from './property-url';

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

const MAX_REFS = 50_000;

function resolveTitle(title: unknown, lang: string): string {
  if (typeof title === 'string') return title;
  if (!title || typeof title !== 'object') return '';
  const map = title as Record<string, unknown>;
  const base = lang.split('-')[0];
  for (const k of [lang, base, 'en']) {
    const v = map[k];
    if (typeof v === 'string' && v) return v;
  }
  for (const v of Object.values(map)) {
    if (typeof v === 'string' && v) return v;
  }
  return '';
}

// Every published property's reference + URL title slug, for sitemaps. The
// WordPress plugin's /spw-sitemap.xml and its Yoast / Rank Math / core-WP
// sitemap providers are built from this list.
@Controller('api/v1/property-refs')
@UseGuards(ApiKeyThrottlerGuard)
@SkipThrottle({ default: true, short: true, medium: true, long: true })
export class PublicPropertyRefsController {
  constructor(
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    private readonly tenantService: TenantService,
  ) {}

  @Public()
  @Get()
  async list(
    @Headers('x-api-key') apiKey: string,
    @Query('lang') langParam?: string,
    @Query('limit') limitParam?: string,
  ) {
    if (!apiKey) throw new UnauthorizedException('API key required');
    const tenant = await this.tenantService.findActiveWidgetTenantByApiKey(apiKey);
    if (!tenant) throw new UnauthorizedException('Invalid API key');

    const lang = (langParam || 'en').trim().toLowerCase().slice(0, 5) || 'en';
    const limit = Math.min(Math.max(parseInt(limitParam || '', 10) || MAX_REFS, 1), MAX_REFS);

    const rows = await this.propertyRepository
      .createQueryBuilder('p')
      .leftJoin('p.location', 'location')
      .leftJoin('p.propertyType', 'propertyType')
      .select(['p.id', 'p.reference', 'p.title', 'p.slug', 'p.updatedAt', 'location.id', 'location.name', 'propertyType.id', 'propertyType.name'])
      .where('p.tenantId = :tenantId', { tenantId: tenant.id })
      .andWhere('p.status = :status', { status: 'active' })
      .andWhere('p.isPublished = :published', { published: true })
      .orderBy('p.updatedAt', 'DESC')
      .take(limit)
      .getMany();
    const slugFormat = (tenant.settings as { slugFormat?: unknown } | null)?.slugFormat;

    return rows.map((p) => {
      const title = resolveTitle(p.title, lang);
      return {
        reference: p.reference,
        // The full URL segment (the same one the widget links to). titleSlug
        // stays for plugins older than 2.6.
        segment: propertyUrlSegment(
          {
            reference: p.reference,
            title,
            slug: p.slug,
            location: p.location ? { name: resolveTitle(p.location.name, lang) } : null,
            propertyType: p.propertyType ? { name: resolveTitle(p.propertyType.name, lang) } : null,
          },
          slugFormat,
        ),
        titleSlug: slugifyTitle(title),
        updatedAt: p.updatedAt,
      };
    });
  }
}
