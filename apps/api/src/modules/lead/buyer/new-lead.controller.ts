import { Body, Controller, Delete, Get, Param, ParseIntPipe, Put, Query, UseGuards } from '@nestjs/common';
import { JwtPayload } from '@spm/shared';
import { JwtAuthGuard, RolesGuard, TenantGuard } from '../../../common/guards';
import { CurrentTenant, CurrentUser } from '../../../common/decorators';
import { viewerOf } from './buyer.controller';
import { NewLeadService } from './new-lead.service';
import { ListNewLeadsDto, NewLeadRoleDto } from './dto/buyer.dto';

// New Leads page (sidebar). No add-on: every client gets website-form leads.
@Controller('api/dashboard/new-leads')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class NewLeadController {
  constructor(private readonly newLeads: NewLeadService) {}

  @Get()
  list(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Query() dto: ListNewLeadsDto) {
    return this.newLeads.list(tenantId, viewerOf(user), dto.page ?? 1);
  }

  @Get('count')
  count(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload) {
    return this.newLeads.count(tenantId, viewerOf(user));
  }

  @Put(':id/role')
  assignRole(
    @CurrentTenant() tenantId: number,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NewLeadRoleDto,
  ) {
    return this.newLeads.assignRole(tenantId, viewerOf(user), id, dto.role);
  }

  @Delete(':id')
  remove(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.newLeads.remove(tenantId, viewerOf(user), id);
  }
}
