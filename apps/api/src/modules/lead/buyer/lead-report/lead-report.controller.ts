import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtPayload } from '@spm/shared';
import { DashboardAddonGuard, JwtAuthGuard, RolesGuard, TenantGuard } from '../../../../common/guards';
import { CurrentTenant, CurrentUser, RequiresAddon, Roles } from '../../../../common/decorators';
import { viewerOf } from '../buyer.controller';
import { LeadReportQueryDto } from '../dto/lead-report.dto';
import { LeadReportService } from './lead-report.service';

// Lead Report (Contacts → Lead Report). Registered before BuyerController so
// 'lead-report' is not read as a buyer id. Everyone with Buyer Match sees
// it (agents their own leads); the CSV is for managers, like the buyer export.
@Controller('api/dashboard/buyers')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard, RolesGuard)
@RequiresAddon('buyerMatch')
export class LeadReportController {
  constructor(private readonly report: LeadReportService) {}

  @Get('lead-report')
  list(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Query() dto: LeadReportQueryDto) {
    return this.report.list(tenantId, viewerOf(user), dto);
  }

  @Get('lead-report/summary')
  summary(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Query() dto: LeadReportQueryDto) {
    return this.report.summary(tenantId, viewerOf(user), dto);
  }

  @Get('lead-report.csv')
  @Roles('admin')
  async exportCsv(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Query() dto: LeadReportQueryDto, @Res() res: Response) {
    const { filename, csv } = await this.report.exportCsv(tenantId, viewerOf(user), dto);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(csv);
  }
}
