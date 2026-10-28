import {
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  ParseIntPipe,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
  SetMetadata,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { LocationService } from './location.service';
import { TenantService } from '../tenant/tenant.service';
import { IS_PUBLIC_KEY } from '../../common/guards/jwt-auth.guard';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';
import { ResolveNameInterceptor } from '../../common/i18n/resolve-name.interceptor';
import { trimToScope } from '../property/key-scope';
import type { Tenant } from '../../database/entities';

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// Widget lookup endpoint — returns the tenant's full location tree so the
// search dropdowns can render hierarchical options without exposing dashboard
// auth. Entitlement is verified via findActiveWidgetTenantByApiKey so an
// expired or widget-disabled tenant gets 401 instead of leaking the tree.
@Controller('api/v1/locations')
@UseGuards(ApiKeyThrottlerGuard)
@UseInterceptors(ResolveNameInterceptor)
@SkipThrottle({ default: true, short: true, medium: true, long: true })
export class PublicLocationController {
  constructor(
    private readonly locationService: LocationService,
    private readonly tenantService: TenantService,
  ) {}

  private async resolveTenant(apiKey: string): Promise<Tenant> {
    if (!apiKey) throw new UnauthorizedException('API key required');
    const tenant = await this.tenantService.findWidgetTenantForRead(apiKey);
    if (!tenant) throw new UnauthorizedException('Invalid API key');
    return tenant;
  }

  @Public()
  @Get()
  async getLocations(@Headers('x-api-key') apiKey: string) {
    const tenant = await this.resolveTenant(apiKey);
    // A website key limited to some places lists only those (with their parents and children).
    return trimToScope(await this.locationService.findAll(tenant.id), tenant.keyScope?.locationIds);
  }

  // One place's point and outline, for the detail page map. Kept off the
  // property payload because an outline is far larger than the rest of a
  // listing and only the map ever wants it.
  @Public()
  @Get(':id/outline')
  async getOutline(@Headers('x-api-key') apiKey: string, @Param('id', ParseIntPipe) id: number) {
    const { id: tenantId } = await this.resolveTenant(apiKey);
    const outline = await this.locationService.outline(tenantId, id);
    if (!outline) throw new NotFoundException('Location not found');
    return outline;
  }
}
