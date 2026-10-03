import { Controller, Get, Param, Query, Headers, Req, Res, UnauthorizedException, NotFoundException, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { PropertyService } from './property.service';
import { PropertySearchService } from './property-search.service';
import { SearchPropertyDto } from './dto';
import { TenantService } from '../tenant/tenant.service';
import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../../common/guards/jwt-auth.guard';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';
import { ResolveNameInterceptor } from '../../common/i18n/resolve-name.interceptor';
import { PropertyUrlInterceptor, PropertyUrlRequest } from './property-url.interceptor';
import { withWidgetCache } from '../../common/http/widget-http-cache';
import type { Tenant } from '../../database/entities';

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

const LISTING_TYPES = ['sale', 'rent', 'holiday_rent', 'development'];

// Settings -> Widget -> Listing Types. Unticking one (say both rentals) means
// the site has none: not in search, lists, map, similar, nor at its own URL.
// Nothing set, or nothing valid, means every type.
function siteListingTypes(settings: unknown): string[] | null {
  const raw = (settings as { enabledListingTypes?: unknown } | null)?.enabledListingTypes;
  if (!Array.isArray(raw)) return null;
  const types = raw.filter((t): t is string => typeof t === 'string' && LISTING_TYPES.includes(t));
  return types.length && types.length < LISTING_TYPES.length ? types : null;
}

// Public widget/property API. Rate limits are scoped per tenant API key
// (not per IP) so one tenant's hot widget can't consume another tenant's
// budget when they share a CDN/proxy IP. The global IP-based throttlers
// are skipped here — ApiKeyThrottlerGuard is authoritative and pulls its
// per-request limit from tenant.plan.ratePerMinute.
@Controller('api/v1/properties')
@UseGuards(ApiKeyThrottlerGuard)
@UseInterceptors(PropertyUrlInterceptor, ResolveNameInterceptor)
@SkipThrottle({ default: true, short: true, medium: true, long: true })
export class PublicPropertyController {
  constructor(
    private readonly propertyService: PropertyService,
    private readonly propertySearchService: PropertySearchService,
    private readonly tenantService: TenantService,
  ) {}

  // Resolves the tenant + verifies entitlement (active subscription + widget
  // enabled). Returns 401 either way so a probe can't distinguish "wrong key"
  // from "expired subscription".
  private async getTenantFromApiKey(apiKey: string, req: PropertyUrlRequest): Promise<Tenant> {
    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }
    const tenant = await this.tenantService.findWidgetTenantForRead(apiKey);
    if (!tenant) {
      throw new UnauthorizedException('Invalid API key');
    }
    req.spwSlugFormat = (tenant.settings as { slugFormat?: unknown } | null)?.slugFormat;
    req.spwListingTypes = siteListingTypes(tenant.settings);
    return tenant;
  }

  // Every route below answers a revalidation with a 304 and no listing query
  // when nothing that feeds the response has changed — see widget-http-cache.
  // The tag rests on tenant.syncVersion, which property create/update/delete,
  // mark-as-sold, feed imports/wipes and "Clear cache" bump. Translation and
  // SEO jobs, CSV imports, location/type templates and location/type/feature
  // edits don't yet; the tag's time bucket bounds how stale those can get.
  private cached<T>(
    req: PropertyUrlRequest,
    res: Response,
    tenant: Tenant,
    route: string,
    load: () => Promise<T>,
    params?: Record<string, unknown>,
  ): Promise<T | null> {
    return withWidgetCache(
      req,
      res,
      { tenantId: tenant.id, syncVersion: tenant.syncVersion, settings: tenant.settings, route, params },
      load,
    );
  }

  @Public()
  @Get()
  async search(
    @Headers('x-api-key') apiKey: string,
    @Req() req: PropertyUrlRequest,
    @Res({ passthrough: true }) res: Response,
    @Query() dto: SearchPropertyDto,
  ) {
    const tenant = await this.getTenantFromApiKey(apiKey, req);
    return this.cached(req, res, tenant, 'search', () =>
      this.propertyService.search(tenant.id, { ...dto, siteListingTypes: req.spwListingTypes ?? undefined }),
    );
  }

  // Map search: every matching listing as a light point (declared before
  // `:reference` so "map" isn't read as a reference).
  // The places a search covers, with counts and outlines — what a map can
  // honestly show when listings have no coordinates of their own.
  @Public()
  @Get('areas')
  async areas(
    @Headers('x-api-key') apiKey: string,
    @Req() req: PropertyUrlRequest,
    @Res({ passthrough: true }) res: Response,
    @Query() dto: SearchPropertyDto,
  ) {
    const tenant = await this.getTenantFromApiKey(apiKey, req);
    return this.cached(req, res, tenant, 'areas', () =>
      this.propertySearchService.areas(tenant.id, { ...dto, siteListingTypes: req.spwListingTypes ?? undefined }),
    );
  }

  // Live counts beside the search form's type and location choices.
  @Public()
  @Get('facets')
  async facets(
    @Headers('x-api-key') apiKey: string,
    @Req() req: PropertyUrlRequest,
    @Res({ passthrough: true }) res: Response,
    @Query() dto: SearchPropertyDto,
  ) {
    const tenant = await this.getTenantFromApiKey(apiKey, req);
    return this.cached(req, res, tenant, 'facets', () =>
      this.propertySearchService.facets(tenant.id, { ...dto, siteListingTypes: req.spwListingTypes ?? undefined }),
    );
  }

  @Public()
  @Get('map')
  async mapPoints(
    @Headers('x-api-key') apiKey: string,
    @Req() req: PropertyUrlRequest,
    @Res({ passthrough: true }) res: Response,
    @Query() dto: SearchPropertyDto,
  ) {
    const tenant = await this.getTenantFromApiKey(apiKey, req);
    return this.cached(req, res, tenant, 'map', () =>
      this.propertySearchService.mapPoints(tenant.id, { ...dto, siteListingTypes: req.spwListingTypes ?? undefined }),
    );
  }

  // Similar properties for the widget detail page. Declared BEFORE `:reference`
  // so the route matcher doesn't treat "FOO/similar" as a single reference
  // segment.
  @Public()
  @Get(':reference/similar')
  async findSimilar(
    @Headers('x-api-key') apiKey: string,
    @Req() req: PropertyUrlRequest,
    @Res({ passthrough: true }) res: Response,
    @Param('reference') reference: string,
    @Query('limit') limitStr?: string,
  ) {
    const tenant = await this.getTenantFromApiKey(apiKey, req);
    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 6, 1), 50) : 6;
    return this.cached(
      req,
      res,
      tenant,
      'similar',
      () => this.propertySearchService.findSimilar(tenant.id, reference, limit, req.spwListingTypes),
      { reference },
    );
  }

  @Public()
  @Get(':reference')
  async findByReference(
    @Headers('x-api-key') apiKey: string,
    @Req() req: PropertyUrlRequest,
    @Res({ passthrough: true }) res: Response,
    @Param('reference') reference: string,
  ) {
    const tenant = await this.getTenantFromApiKey(apiKey, req);
    // The 404 is thrown inside the loader so it never carries the cache headers.
    return this.cached(
      req,
      res,
      tenant,
      'reference',
      async () => {
        const property = await this.propertyService.findByReference(tenant.id, reference);
        const allowed = req.spwListingTypes;
        if (!property || property.status !== 'active' || !property.isPublished || (allowed && !allowed.includes(property.listingType))) {
          throw new NotFoundException('Property not found');
        }
        return property;
      },
      { reference },
    );
  }
}
