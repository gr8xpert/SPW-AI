import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtPayload } from '@spm/shared';
import { DashboardAddonGuard, JwtAuthGuard, RolesGuard, TenantGuard } from '../../../../common/guards';
import { CurrentTenant, CurrentUser, RequiresAddon, Roles } from '../../../../common/decorators';
import { viewerOf } from '../buyer.controller';
import { BuyerAlertService } from './buyer-alert.service';

export class AlertListDto {
  @IsOptional() @IsIn(['pending', 'approved', 'rejected', 'sent', 'skipped'])
  status?: 'pending' | 'approved' | 'rejected' | 'sent' | 'skipped';

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;
}

export class AlertDecideDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @Type(() => Number) @IsInt({ each: true })
  ids: number[];

  @IsIn(['approve', 'reject', 'send_now'])
  action: 'approve' | 'reject' | 'send_now';
}

// The approval screen for new-listing / price-drop alerts. Registered
// before BuyerController so buyers/alerts isn't taken for buyers/:id.
@Controller('api/dashboard/buyers/alerts')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard, RolesGuard)
@RequiresAddon('buyerMatch')
export class BuyerAlertController {
  constructor(private readonly alerts: BuyerAlertService) {}

  @Get()
  list(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Query() q: AlertListDto) {
    return this.alerts.list(tenantId, viewerOf(user), q.status ?? 'pending', q.page ?? 1);
  }

  @Post('decide')
  @HttpCode(HttpStatus.OK)
  decide(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Body() dto: AlertDecideDto) {
    return this.alerts.decide(tenantId, viewerOf(user), [...new Set(dto.ids)], dto.action);
  }

  // "Check now": the scan the timer runs every 10 minutes, for this agency.
  @Post('scan')
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  scan(@CurrentTenant() tenantId: number) {
    return this.alerts.scanTenant(tenantId);
  }

  // The digest the timer runs every 15 minutes: sends only when it is due
  // and has not gone out today.
  @Post('digest')
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  digest(@CurrentTenant() tenantId: number) {
    return this.alerts.digestTenant(tenantId);
  }
}
