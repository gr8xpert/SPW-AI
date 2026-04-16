import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { TicketService } from './ticket.service';
import { CreateTicketDto, UpdateTicketDto, CreateMessageDto } from './dto';
import { CurrentTenant, CurrentUser } from '../../common/decorators';
import { TicketStatus } from '../../database/entities';

@Controller('api/dashboard/tickets')
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  @Post()
  create(
    @CurrentTenant() tenantId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: CreateTicketDto,
  ) {
    return this.ticketService.create(tenantId, userId, dto);
  }

  @Get()
  findAll(
    @CurrentTenant() tenantId: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('role') role: string,
    @Query('status') status?: TicketStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const options: any = {
      status,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    };

    // If not admin, only show own tickets
    if (role !== 'admin') {
      options.userId = userId;
    }

    return this.ticketService.findAll(tenantId, options);
  }

  @Get('stats')
  getStats(@CurrentTenant() tenantId: number) {
    return this.ticketService.getStats(tenantId);
  }

  @Get(':id')
  findOne(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.ticketService.findOne(tenantId, id);
  }

  @Put(':id')
  update(
    @CurrentTenant() tenantId: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('role') role: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTicketDto,
  ) {
    const isSuperAdmin = role === 'super_admin';
    return this.ticketService.update(tenantId, id, dto, userId, isSuperAdmin);
  }

  @Post(':id/messages')
  addMessage(
    @CurrentTenant() tenantId: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('role') role: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateMessageDto,
  ) {
    const isStaff = role === 'super_admin' || role === 'admin';
    return this.ticketService.addMessage(tenantId, id, userId, dto, isStaff);
  }
}

// Super Admin Controller for managing all tickets
@Controller('api/super-admin/tickets')
export class SuperAdminTicketController {
  constructor(private readonly ticketService: TicketService) {}

  @Get()
  findAll(
    @Query('status') status?: TicketStatus,
    @Query('tenantId') tenantId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ticketService.findAllForSuperAdmin({
      status,
      tenantId: tenantId ? parseInt(tenantId) : undefined,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Get('stats')
  getStats() {
    return this.ticketService.getStats();
  }

  @Put(':tenantId/:id/assign')
  assign(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body('assignedTo') assignedTo: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.ticketService.update(tenantId, id, { assignedTo }, userId, true);
  }
}
