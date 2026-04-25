import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WebmasterService } from './webmaster.service';
import { CreateTimeEntryDto, UpdateTimeEntryDto, CreateWebmasterDto, UpdateWebmasterDto } from './dto';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole, JwtPayload } from '@spw/shared';

// ============ WEBMASTER ENDPOINTS ============

@Controller('api/webmaster')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.WEBMASTER)
export class WebmasterController {
  constructor(private readonly webmasterService: WebmasterService) {}

  @Get('dashboard')
  async getDashboard(@CurrentUser() user: JwtPayload) {
    return this.webmasterService.getWebmasterStats(user.sub);
  }

  @Get('tickets')
  async getAssignedTickets(@CurrentUser() user: JwtPayload) {
    return this.webmasterService.getAssignedTickets(user.sub);
  }

  @Post('tickets/:id/complete')
  async completeTicketWork(
    @Param('id', ParseIntPipe) ticketId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.webmasterService.completeTicketWork(ticketId, user.sub);
  }

  @Get('time-entries')
  async getTimeEntries(
    @CurrentUser() user: JwtPayload,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.webmasterService.getTimeEntries(user.sub, dateFrom, dateTo);
  }

  @Post('time-entries')
  async createTimeEntry(
    @Body() dto: CreateTimeEntryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.webmasterService.createTimeEntry(user.sub, dto);
  }

  @Put('time-entries/:id')
  async updateTimeEntry(
    @Param('id', ParseIntPipe) entryId: number,
    @Body() dto: UpdateTimeEntryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.webmasterService.updateTimeEntry(user.sub, entryId, dto);
  }

  @Delete('time-entries/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTimeEntry(
    @Param('id', ParseIntPipe) entryId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.webmasterService.deleteTimeEntry(user.sub, entryId);
  }
}

// ============ SUPER ADMIN WEBMASTER MANAGEMENT ============

@Controller('api/super-admin/webmasters')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class WebmasterAdminController {
  constructor(private readonly webmasterService: WebmasterService) {}

  @Get()
  async getWebmasters() {
    return this.webmasterService.getWebmasters();
  }

  @Post()
  async createWebmaster(@Body() dto: CreateWebmasterDto) {
    return this.webmasterService.createWebmaster(dto);
  }

  @Put(':id')
  async updateWebmaster(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWebmasterDto,
  ) {
    return this.webmasterService.updateWebmaster(id, dto);
  }

  @Get('unpaid-hours')
  async getUnpaidHours() {
    return this.webmasterService.getUnpaidHoursSummary();
  }

  @Get(':id/time-entries')
  async getWebmasterTimeEntries(
    @Param('id', ParseIntPipe) userId: number,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.webmasterService.getTimeEntries(userId, dateFrom, dateTo);
  }

  @Post('tickets/:ticketId/assign')
  async assignTicket(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body('webmasterId') webmasterId: number | null,
  ) {
    return this.webmasterService.assignTicket(ticketId, webmasterId);
  }

  @Post('time-entries/mark-paid')
  async markEntriesAsPaid(@Body('entryIds') entryIds: number[]) {
    const count = await this.webmasterService.markEntriesAsPaid(entryIds);
    return { markedAsPaid: count };
  }

  @Get('tickets/:ticketId/time-entries')
  async getTicketTimeEntries(@Param('ticketId', ParseIntPipe) ticketId: number) {
    return this.webmasterService.getTicketTimeEntries(ticketId);
  }
}
