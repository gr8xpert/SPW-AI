import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtPayload } from '@spm/shared';
import { JwtAuthGuard, RolesGuard, TenantGuard } from '../../../common/guards';
import { CurrentTenant, CurrentUser } from '../../../common/decorators';
import { viewerOf } from './buyer.controller';
import { NewLeadService } from './new-lead.service';
import { ListNewLeadsDto, NewLeadHandledDto, NewLeadRoleDto } from './dto/buyer.dto';
import { WhatsAppDto } from './dto/buyer-whatsapp.dto';
import { BuyerWhatsAppService } from './whatsapp/buyer-whatsapp.service';

// New Leads page (sidebar). No add-on: every client gets website-form leads.
@Controller('api/dashboard/new-leads')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class NewLeadController {
  constructor(
    private readonly newLeads: NewLeadService,
    private readonly whatsapp: BuyerWhatsAppService,
  ) {}

  @Get()
  list(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Query() dto: ListNewLeadsDto) {
    return this.newLeads.list(tenantId, viewerOf(user), dto.page ?? 1, dto.view ?? 'waiting');
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

  @Put(':id/handled')
  setHandled(
    @CurrentTenant() tenantId: number,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NewLeadHandledDto,
  ) {
    return this.newLeads.setHandled(tenantId, viewerOf(user), id, dto.handled);
  }

  // Reply to the enquiry on WhatsApp (click-to-chat), with or without Buyer Match.
  @Post(':id/whatsapp/preview')
  @HttpCode(HttpStatus.OK)
  whatsappPreview(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: WhatsAppDto) {
    return this.whatsapp.preview(tenantId, viewerOf(user), id, { ...dto, kind: 'enquiry' }, 'newLead');
  }

  @Post(':id/whatsapp/open')
  @HttpCode(HttpStatus.OK)
  whatsappOpen(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: WhatsAppDto) {
    return this.whatsapp.open(tenantId, viewerOf(user), id, { ...dto, kind: 'enquiry' }, 'newLead');
  }

  @Delete(':id')
  remove(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.newLeads.remove(tenantId, viewerOf(user), id);
  }
}
