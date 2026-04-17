import {
  Controller,
  Get,
  Headers,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { TenantService } from './tenant.service';
import { IS_PUBLIC_KEY } from '../../common/guards/jwt-auth.guard';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';
import { UseGuards } from '@nestjs/common';

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// Widget / WP plugin polls this to learn whether its local cache is stale.
// Separate from /api/v1/properties so polling doesn't eat into the main
// public-API rate budget — a 10s poll interval on every widget page load
// would otherwise blow the 60/min cap.
//
// Per-api-key bucket sized generously for polling: 600/min covers one
// poll per second (overkill — widget polls every 30–60s in practice).
@Controller('api/v1/sync-meta')
@UseGuards(ApiKeyThrottlerGuard)
@SkipThrottle({ default: true, short: true, medium: true, long: true })
@Throttle({ 'api-key': { limit: 600, ttl: 60_000 } })
export class PublicSyncMetaController {
  constructor(private readonly tenantService: TenantService) {}

  @Public()
  @Get()
  async getSyncMeta(@Headers('x-api-key') apiKey: string) {
    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }
    const tenant = await this.tenantService.findByApiKey(apiKey);
    if (!tenant) {
      throw new UnauthorizedException('Invalid API key');
    }
    return this.tenantService.getSyncMeta(tenant.id);
  }
}
