import { Controller, Get, Param, Query, Headers, UnauthorizedException, NotFoundException, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PropertyService } from './property.service';
import { SearchPropertyDto } from './dto';
import { TenantService } from '../tenant/tenant.service';
import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../../common/guards/jwt-auth.guard';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// Public widget/property API. Rate limits are scoped per tenant API key
// (not per IP) so one tenant's hot widget can't consume another tenant's
// budget when they share a CDN/proxy IP. The global IP-based throttlers
// are skipped here — ApiKeyThrottlerGuard is authoritative and pulls its
// per-request limit from tenant.plan.ratePerMinute.
@Controller('api/v1/properties')
@UseGuards(ApiKeyThrottlerGuard)
@SkipThrottle({ default: true, short: true, medium: true, long: true })
export class PublicPropertyController {
  constructor(
    private readonly propertyService: PropertyService,
    private readonly tenantService: TenantService,
  ) {}

  private async getTenantIdFromApiKey(apiKey: string): Promise<number> {
    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }
    const tenant = await this.tenantService.findByApiKey(apiKey);
    if (!tenant) {
      throw new UnauthorizedException('Invalid API key');
    }
    return tenant.id;
  }

  @Public()
  @Get()
  async search(@Headers('x-api-key') apiKey: string, @Query() dto: SearchPropertyDto) {
    const tenantId = await this.getTenantIdFromApiKey(apiKey);
    return this.propertyService.search(tenantId, dto);
  }

  @Public()
  @Get(':reference')
  async findByReference(@Headers('x-api-key') apiKey: string, @Param('reference') reference: string) {
    const tenantId = await this.getTenantIdFromApiKey(apiKey);
    const property = await this.propertyService.findByReference(tenantId, reference);
    if (!property || property.status !== 'active' || !property.isPublished) {
      throw new NotFoundException('Property not found');
    }
    return property;
  }
}
