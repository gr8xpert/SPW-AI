import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtPayload } from '@spm/shared';
import { DashboardAddonGuard, JwtAuthGuard, RolesGuard, TenantGuard } from '../../../../common/guards';
import { CurrentTenant, CurrentUser, RequiresAddon, Roles } from '../../../../common/decorators';
import { viewerOf } from '../buyer.controller';
import { ListBuyersDto } from '../dto/buyer.dto';
import { BuyerReportsService } from '../reports/buyer-reports.service';
import { BuyerHousekeepingService } from './buyer-housekeeping.service';
import { BuyerGdprService } from './buyer-gdpr.service';

class ReportQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(24)
  months?: number;
}

class MergeDto {
  @Type(() => Number) @IsInt() @Min(1)
  sourceId: number;
}

class ConsentDto {
  @IsBoolean()
  on: boolean;

  @IsOptional() @IsIn(['website', 'form', 'email', 'phone', 'in_person', 'import', 'other'])
  source?: string;
}

class EraseDto {
  @IsString()
  confirm: string;
}

// Milestone J: agency reports, duplicates + merge, CSV export (managers) and
// GDPR (consent, unsubscribe for every agent who can see the buyer; erase
// for managers). Registered before BuyerController so 'reports' etc. are not
// read as a buyer id.
@Controller('api/dashboard/buyers')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard, RolesGuard)
@RequiresAddon('buyerMatch')
export class BuyerHousekeepingController {
  constructor(
    private readonly reports: BuyerReportsService,
    private readonly housekeeping: BuyerHousekeepingService,
    private readonly gdpr: BuyerGdprService,
  ) {}

  @Get('reports')
  @Roles('admin')
  report(@CurrentTenant() tenantId: number, @Query() q: ReportQueryDto) {
    return this.reports.report(tenantId, q.months ?? 12);
  }

  @Get('duplicates')
  @Roles('admin')
  duplicates(@CurrentTenant() tenantId: number) {
    return this.housekeeping.duplicates(tenantId);
  }

  @Get('export.csv')
  @Roles('admin')
  async exportCsv(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Query() dto: ListBuyersDto, @Res() res: Response) {
    const { filename, csv } = await this.housekeeping.exportCsv(tenantId, viewerOf(user), dto);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(csv);
  }

  @Post(':id/merge')
  @HttpCode(200)
  @Roles('admin')
  merge(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: MergeDto) {
    return this.housekeeping.merge(tenantId, viewerOf(user), id, dto.sourceId);
  }

  @Put(':id/consent')
  consent(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: ConsentDto) {
    return this.gdpr.setConsent(tenantId, viewerOf(user), id, dto.on, dto.source);
  }

  @Post(':id/unsubscribe')
  @HttpCode(200)
  unsubscribe(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.gdpr.setSubscribed(tenantId, viewerOf(user), id, false);
  }

  @Post(':id/resubscribe')
  @HttpCode(200)
  resubscribe(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.gdpr.setSubscribed(tenantId, viewerOf(user), id, true);
  }

  @Post(':id/erase')
  @HttpCode(200)
  @Roles('admin')
  erase(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: EraseDto) {
    return this.gdpr.erase(tenantId, viewerOf(user), id, dto.confirm);
  }
}
