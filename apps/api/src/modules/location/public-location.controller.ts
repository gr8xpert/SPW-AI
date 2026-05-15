import {
  Controller,
  Get,
  Headers,
  UnauthorizedException,
  UseGuards,
  SetMetadata,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { LocationService } from './location.service';
import { TenantService } from '../tenant/tenant.service';
import { IS_PUBLIC_KEY } from '../../common/guards/jwt-auth.guard';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// Widget lookup endpoint — returns the tenant's full location tree so the
// search dropdowns can render hierarchical options without exposing dashboard
// auth. Entitlement is verified via findActiveWidgetTenantByApiKey so an
// expired or widget-disabled tenant gets 401 instead of leaking the tree.
@Controller('api/v1/locations')
@UseGuards(ApiKeyThrottlerGuard)
@SkipThrottle({ default: true, short: true, medium: true, long: true })
export class PublicLocationController {
  constructor(
    private readonly locationService: LocationService,
    private readonly tenantService: TenantService,
  ) {}

  private async resolveTenantId(apiKey: string): Promise<number> {
    if (!apiKey) throw new UnauthorizedException('API key required');
    const tenant = await this.tenantService.findActiveWidgetTenantByApiKey(apiKey);
    if (!tenant) throw new UnauthorizedException('Invalid API key');
    return tenant.id;
  }

  @Public()
  @Get()
  async getLocations(@Headers('x-api-key') apiKey: string) {
    const tenantId = await this.resolveTenantId(apiKey);
    return this.locationService.findAll(tenantId);
  }
}
