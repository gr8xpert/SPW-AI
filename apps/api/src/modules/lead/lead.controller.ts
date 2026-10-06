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
import { LeadService } from './lead.service';
import { CreateLeadDto, UpdateLeadDto, CreateActivityDto } from './dto';
import { CurrentTenant, CurrentUser } from '../../common/decorators';
import { LeadStatus } from '../../database/entities';

@Controller('api/dashboard/leads')
export class LeadController {
  constructor(private readonly leadService: LeadService) {}

  @Post()
  create(
    @CurrentTenant() tenantId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: CreateLeadDto,
  ) {
    return this.leadService.create(tenantId, userId, dto);
  }

  @Get()
  findAll(
    @CurrentTenant() tenantId: number,
    @Query('status') status?: LeadStatus,
    @Query('assignedTo') assignedTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.leadService.findAll(tenantId, {
      status,
      assignedTo: assignedTo ? parseInt(assignedTo) : undefined,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Get('pipeline')
  getPipeline(@CurrentTenant() tenantId: number) {
    return this.leadService.findByPipeline(tenantId);
  }

  @Get('stats')
  getStats(@CurrentTenant() tenantId: number) {
    return this.leadService.getStats(tenantId);
  }

  @Get(':id')
  findOne(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.leadService.findOne(tenantId, id);
  }

  @Put(':id')
  update(
    @CurrentTenant() tenantId: number,
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leadService.update(tenantId, id, userId, dto);
  }

  @Post(':id/activities')
  addActivity(
    @CurrentTenant() tenantId: number,
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateActivityDto,
  ) {
    return this.leadService.addActivity(tenantId, id, userId, dto);
  }

  @Get(':id/activities')
  getActivities(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.leadService.getActivities(tenantId, id);
  }
}
