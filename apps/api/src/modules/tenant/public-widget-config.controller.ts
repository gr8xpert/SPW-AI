import {
  Controller,
  Get,
  Headers,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { TenantService } from './tenant.service';
import { IS_PUBLIC_KEY } from '../../common/guards/jwt-auth.guard';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// Widget pulls dashboard-driven config (counts, options, toggles) from here
// during bundle load. Auth is API-key only; sensitive keys never leave the
// dashboard. Throttled generously since the widget calls it once per page.
@Controller('api/v1/widget-config')
@UseGuards(ApiKeyThrottlerGuard)
@SkipThrottle({ default: true, short: true, medium: true, long: true })
@Throttle({ 'api-key': { limit: 600, ttl: 60_000 } })
export class PublicWidgetConfigController {
  constructor(private readonly tenantService: TenantService) {}

  @Public()
  @Get()
  async getConfig(@Headers('x-api-key') apiKey: string) {
    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }
    const tenant = await this.tenantService.findActiveWidgetTenantByApiKey(apiKey);
    if (!tenant) {
      throw new UnauthorizedException('Invalid API key');
    }
    return this.tenantService.getPublicWidgetConfig(tenant.id);
  }
}
