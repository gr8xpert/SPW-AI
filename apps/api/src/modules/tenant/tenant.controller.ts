import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
} from '@nestjs/common';
import { TenantService } from './tenant.service';
import { JwtAuthGuard, TenantGuard } from '../../common/guards';
import { CurrentTenant } from '../../common/decorators';
import { TenantSettings } from '@spw/shared';

@Controller('api/dashboard/tenant')
@UseGuards(JwtAuthGuard, TenantGuard)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  async getCurrent(@CurrentTenant() tenantId: number) {
    return this.tenantService.findById(tenantId);
  }

  @Put('settings')
  async updateSettings(
    @CurrentTenant() tenantId: number,
    @Body() settings: Partial<TenantSettings>,
  ) {
    return this.tenantService.updateSettings(tenantId, settings);
  }

  @Get('api-credentials')
  async getApiCredentials(@CurrentTenant() tenantId: number) {
    return this.tenantService.getApiCredentials(tenantId);
  }
}
