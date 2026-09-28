import { Controller, Get, Param, Query, Headers, Req, UnauthorizedException, NotFoundException, UseGuards, UseInterceptors } from '@nestjs/common';
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

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

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
  private async getTenantIdFromApiKey(apiKey: string, req?: PropertyUrlRequest): Promise<number> {
    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }
    const tenant = await this.tenantService.findWidgetTenantForRead(apiKey);
    if (!tenant) {
      throw new UnauthorizedException('Invalid API key');
    }
    if (req) req.spwSlugFormat = (tenant.settings as { slugFormat?: unknown } | null)?.slugFormat;
    return tenant.id;
  }

  @Public()
  @Get()
  async search(@Headers('x-api-key') apiKey: string, @Req() req: PropertyUrlRequest, @Query() dto: SearchPropertyDto) {
    const tenantId = await this.getTenantIdFromApiKey(apiKey, req);
    return this.propertyService.search(tenantId, dto);
  }

  // Map search: every matching listing as a light point (declared before
  // `:reference` so "map" isn't read as a reference).
  // The places a search covers, with counts and outlines — what a map can
  // honestly show when listings have no coordinates of their own.
  @Public()
  @Get('areas')
  async areas(@Headers('x-api-key') apiKey: string, @Req() req: PropertyUrlRequest, @Query() dto: SearchPropertyDto) {
    const tenantId = await this.getTenantIdFromApiKey(apiKey, req);
    return this.propertySearchService.areas(tenantId, dto);
  }

  @Public()
  @Get('map')
  async mapPoints(@Headers('x-api-key') apiKey: string, @Req() req: PropertyUrlRequest, @Query() dto: SearchPropertyDto) {
    const tenantId = await this.getTenantIdFromApiKey(apiKey, req);
    return this.propertySearchService.mapPoints(tenantId, dto);
  }

  // Similar properties for the widget detail page. Declared BEFORE `:reference`
  // so the route matcher doesn't treat "FOO/similar" as a single reference
  // segment.
  @Public()
  @Get(':reference/similar')
  async findSimilar(
    @Headers('x-api-key') apiKey: string,
    @Req() req: PropertyUrlRequest,
    @Param('reference') reference: string,
    @Query('limit') limitStr?: string,
  ) {
    const tenantId = await this.getTenantIdFromApiKey(apiKey, req);
    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 6, 1), 50) : 6;
    return this.propertySearchService.findSimilar(tenantId, reference, limit);
  }

  @Public()
  @Get(':reference')
  async findByReference(@Headers('x-api-key') apiKey: string, @Req() req: PropertyUrlRequest, @Param('reference') reference: string) {
    const tenantId = await this.getTenantIdFromApiKey(apiKey, req);
    const property = await this.propertyService.findByReference(tenantId, reference);
    if (!property || property.status !== 'active' || !property.isPublished) {
      throw new NotFoundException('Property not found');
    }
    return property;
  }
}
