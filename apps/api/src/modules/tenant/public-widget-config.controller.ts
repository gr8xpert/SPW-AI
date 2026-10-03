import {
  Controller,
  Get,
  Headers,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Tenant } from '../../database/entities';
import { AI_SEARCH_STATUS, type AiSearchStatusProvider } from '../ai/ai-search-status.token';
import { TenantService } from './tenant.service';
import { SiteCheckinService } from '../website-health/site-checkin.service';
import { isPreviewToken } from '../../common/crypto/preview-token';
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
  constructor(
    private readonly tenantService: TenantService,
    private readonly checkins: SiteCheckinService,
    private readonly moduleRef: ModuleRef,
  ) {}

  @Public()
  @Get()
  async getConfig(@Headers('x-api-key') apiKey: string, @Headers('origin') origin?: string) {
    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }
    const tenant = await this.tenantService.findWidgetTenantForRead(apiKey);
    if (!tenant) {
      throw new UnauthorizedException('Invalid API key');
    }
    // A browser loading the widget: remember which site (Website Health page).
    if (origin && !isPreviewToken(apiKey)) this.checkins.record(tenant.id, origin, 'widget');
    const [config, aiSearch] = await Promise.all([
      this.tenantService.getPublicWidgetConfig(tenant.id),
      this.aiSearchStatus(tenant),
    ]);
    // Whether to show the AI and voice buttons, so the widget needn't ask
    // ai-search/status separately. Left out if it can't be worked out — the
    // widget then asks that endpoint as before.
    return aiSearch ? { ...config, aiSearch } : config;
  }

  private async aiSearchStatus(tenant: Tenant): Promise<{ enabled: boolean; voice: boolean } | null> {
    try {
      const provider = this.moduleRef.get<AiSearchStatusProvider>(AI_SEARCH_STATUS, { strict: false });
      return await provider.publicStatus(tenant);
    } catch {
      return null;
    }
  }
}
