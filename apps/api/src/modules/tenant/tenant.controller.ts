import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TenantService } from './tenant.service';
import { JwtAuthGuard, TenantGuard, RolesGuard } from '../../common/guards';
import { CurrentTenant, CurrentUser, Roles } from '../../common/decorators';
import { TenantSettings, UserRole, JwtPayload } from '@spw/shared';
import { UpdateWebhookDto } from './dto/update-webhook.dto';

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

  // Bumps the tenant's cache version so widget and WP plugin drop their
  // local caches on the next poll/webhook tick. Admin-only — a stale
  // cache can hide listings, so this is a privileged operation.
  @Post('cache/clear')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async clearCache(
    @CurrentTenant() tenantId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tenantService.clearCache(tenantId, {
      userId: user.sub,
      role: user.role,
      reason: 'dashboard_manual',
    });
  }

  // Webhook configuration — admin-only because misconfiguring the URL (or
  // rotating the secret) breaks every downstream receiver until the new
  // secret is propagated. The full webhookSecret is never returned from GET
  // or PUT; only rotate returns the fresh raw value exactly once.

  @Get('webhook')
  async getWebhook(@CurrentTenant() tenantId: number) {
    return this.tenantService.getWebhookConfig(tenantId);
  }

  @Put('webhook')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateWebhook(
    @CurrentTenant() tenantId: number,
    @Body() dto: UpdateWebhookDto,
  ) {
    return this.tenantService.updateWebhookUrl(tenantId, dto.webhookUrl ?? null);
  }

  @Post('webhook/rotate-secret')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async rotateWebhookSecret(@CurrentTenant() tenantId: number) {
    return this.tenantService.rotateWebhookSecret(tenantId);
  }

  @Get('webhook/deliveries')
  async listWebhookDeliveries(
    @CurrentTenant() tenantId: number,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? Number.parseInt(limit, 10) : 50;
    return this.tenantService.listWebhookDeliveries(
      tenantId,
      Number.isFinite(parsed) ? parsed : 50,
    );
  }

  @Post('webhook/test')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async sendTestWebhook(
    @CurrentTenant() tenantId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tenantService.sendTestWebhook(tenantId, {
      userId: user.sub,
      role: user.role,
    });
  }
}
