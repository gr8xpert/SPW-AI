import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtPayload } from '@spm/shared';
import { CurrentTenant, CurrentUser, Public, RequiresAddon, Roles } from '../../common/decorators';
import { DashboardAddonGuard, JwtAuthGuard, RolesGuard, TenantGuard } from '../../common/guards';
import { ConfirmConsentDto, ConnectMailerLiteDto } from './mailerlite.dto';
import { MailerLiteConnectionService } from './mailerlite-connection.service';
import { MailerLiteWebhookService } from './mailerlite-webhook.service';

// MailerLite settings (managers, not agents).
@Controller('api/dashboard/mailerlite')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard, RolesGuard)
@RequiresAddon('emailCampaign')
@Roles('admin')
export class MailerLiteController {
  constructor(private readonly service: MailerLiteConnectionService) {}

  @Get()
  status(@CurrentTenant() tenantId: number) {
    return this.service.status(tenantId);
  }

  @Post('connect')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  connect(@CurrentTenant() tenantId: number, @Body() dto: ConnectMailerLiteDto) {
    return this.service.connect(tenantId, dto.apiKey);
  }

  @Post('consent')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  consent(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Body() _dto: ConfirmConsentDto) {
    return this.service.confirmConsent(tenantId, user);
  }

  @Post('sync')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  syncNow(@CurrentTenant() tenantId: number) {
    return this.service.syncNow(tenantId);
  }

  @Delete()
  disconnect(@CurrentTenant() tenantId: number) {
    return this.service.disconnect(tenantId);
  }
}

// MailerLite's webhook: the secret token in the path picks the client, the
// signature proves it came from MailerLite. Generous limit: a too-low one would
// drop real unsubscribes after a big campaign.
@Controller('api/webhooks/mailerlite')
@Public()
export class MailerLiteWebhookController {
  constructor(private readonly webhook: MailerLiteWebhookService) {}

  @Post(':token')
  @HttpCode(200)
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  receive(@Param('token') token: string, @Headers('signature') signature: string | undefined, @Req() req: Request) {
    return this.webhook.handle(token, signature, (req as Request & { rawBody?: Buffer }).rawBody);
  }
}
