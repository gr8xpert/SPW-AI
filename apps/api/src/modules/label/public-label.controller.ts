import { Controller, Get, Headers, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { LabelService } from './label.service';
import { TenantService } from '../tenant/tenant.service';
import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../../common/guards/jwt-auth.guard';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Controller('api/v1/labels')
@UseGuards(ApiKeyThrottlerGuard)
@SkipThrottle({ default: true, short: true, medium: true, long: true })
export class PublicLabelController {
  constructor(
    private readonly labelService: LabelService,
    private readonly tenantService: TenantService,
  ) {}

  @Public()
  @Get()
  async getLabels(
    @Headers('x-api-key') apiKey: string,
    @Query('lang') lang?: string,
  ) {
    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }
    const tenant = await this.tenantService.findActiveWidgetTenantByApiKey(apiKey);
    if (!tenant) {
      throw new UnauthorizedException('Invalid API key');
    }
    const language = lang || tenant.settings?.defaultLanguage || 'en';
    return this.labelService.getLabelsForWidget(tenant.id, language);
  }
}
