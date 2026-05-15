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
import { FeatureService } from './feature.service';
import { TenantService } from '../tenant/tenant.service';
import { IS_PUBLIC_KEY } from '../../common/guards/jwt-auth.guard';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';
import { ResolveNameInterceptor } from '../../common/i18n/resolve-name.interceptor';

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Controller('api/v1/features')
@UseGuards(ApiKeyThrottlerGuard)
@UseInterceptors(ResolveNameInterceptor)
@SkipThrottle({ default: true, short: true, medium: true, long: true })
export class PublicFeatureController {
  constructor(
    private readonly featureService: FeatureService,
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
  async getFeatures(@Headers('x-api-key') apiKey: string) {
    const tenantId = await this.resolveTenantId(apiKey);
    return this.featureService.findAll(tenantId);
  }
}
