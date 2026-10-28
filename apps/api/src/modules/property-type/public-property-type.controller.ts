import {
  Controller,
  Get,
  Headers,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
  SetMetadata,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PropertyTypeService } from './property-type.service';
import { TenantService } from '../tenant/tenant.service';
import { IS_PUBLIC_KEY } from '../../common/guards/jwt-auth.guard';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';
import { ResolveNameInterceptor } from '../../common/i18n/resolve-name.interceptor';
import { trimToScope } from '../property/key-scope';
import type { Tenant } from '../../database/entities';

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Controller('api/v1/property-types')
@UseGuards(ApiKeyThrottlerGuard)
@UseInterceptors(ResolveNameInterceptor)
@SkipThrottle({ default: true, short: true, medium: true, long: true })
export class PublicPropertyTypeController {
  constructor(
    private readonly propertyTypeService: PropertyTypeService,
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
  async getPropertyTypes(@Headers('x-api-key') apiKey: string) {
    const tenant = await this.resolveTenant(apiKey);
    // A website key limited to some types lists only those (with their parents and sub-types).
    return trimToScope(await this.propertyTypeService.findAll(tenant.id), tenant.keyScope?.propertyTypeIds);
  }
}
