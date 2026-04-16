import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { LabelService } from './label.service';
import { TenantService } from '../tenant/tenant.service';
import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../../common/guards/jwt-auth.guard';

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Controller('api/v1/labels')
export class PublicLabelController {
  constructor(
    private readonly labelService: LabelService,
    private readonly tenantService: TenantService,
  ) {}

  @Public()
  @Get()
  async getLabels(@Headers('x-api-key') apiKey: string) {
    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }
    const tenant = await this.tenantService.findByApiKey(apiKey);
    if (!tenant) {
      throw new UnauthorizedException('Invalid API key');
    }
    return this.labelService.getLabelsForWidget(tenant.id);
  }
}
