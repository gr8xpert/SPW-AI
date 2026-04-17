import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { TenantService } from './tenant.service';
import { JwtAuthGuard, TenantGuard, RolesGuard } from '../../common/guards';
import { CurrentTenant, CurrentUser, Roles } from '../../common/decorators';
import { TenantSettings, UserRole, JwtPayload } from '@spw/shared';

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

  // Returns the new raw API key exactly once. The caller (dashboard) must
  // display it immediately and not retain it past the confirmation step.
  // Restricted to tenant admins since it invalidates the previous key.
  @Post('api-key/rotate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async rotateApiKey(
    @CurrentTenant() tenantId: number,
    @CurrentUser() _user: JwtPayload,
  ) {
    return this.tenantService.rotateApiKey(tenantId);
  }
}
