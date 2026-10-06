import {
  Controller,
  Get,
  Headers,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { TenantService } from './tenant.service';
import { SiteCheckinService } from '../website-health/site-checkin.service';
import { isPreviewToken } from '../../common/crypto/preview-token';
import { IS_PUBLIC_KEY } from '../../common/guards/jwt-auth.guard';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';
import { UseGuards } from '@nestjs/common';

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// Widget / WP plugin polls this to learn whether its local cache is stale.
// Separate from /api/v1/properties so polling doesn't eat into the main
// public-API rate budget — a 10s poll interval on every widget page load
// would otherwise blow the plan-based cap.
//
// The @Throttle limit here acts as a *floor* on top of ApiKeyThrottlerGuard's
// plan-based resolution: even a Free plan (30/min) gets 600/min here because
// widgets on free sites still need to poll. Paid plans with ratePerMinute >
// 600 keep their higher cap.
@Controller('api/v1/sync-meta')
@UseGuards(ApiKeyThrottlerGuard)
@SkipThrottle({ default: true, short: true, medium: true, long: true })
@Throttle({ 'api-key': { limit: 600, ttl: 60_000 } })
export class PublicSyncMetaController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly checkins: SiteCheckinService,
  ) {}

  @Public()
  @Get()
  async getSyncMeta(
    @Headers('x-api-key') apiKey: string,
    @Headers('x-spm-site') site?: string,
    @Headers('x-spm-plugin') pluginVersion?: string,
    // Plugins before 2.8 (named SPW) send these. 2.8 renamed them to x-spm-*
    // while this read only x-spw-*, so from 09-30 no site checked in and
    // Website Health said "plugin last connected N days ago".
    @Headers('x-spw-site') legacySite?: string,
    @Headers('x-spw-plugin') legacyPluginVersion?: string,
  ) {
    site = site || legacySite;
    pluginVersion = pluginVersion || legacyPluginVersion;
    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }
    const tenant = await this.tenantService.findWidgetTenantForRead(apiKey);
    if (!tenant) {
      throw new UnauthorizedException('Invalid API key');
    }
    // The WordPress plugin says which site it is (Website Health page).
    if (site && !isPreviewToken(apiKey)) this.checkins.record(tenant.id, site, 'plugin', pluginVersion);
    return this.tenantService.getSyncMeta(tenant.id);
  }
}
