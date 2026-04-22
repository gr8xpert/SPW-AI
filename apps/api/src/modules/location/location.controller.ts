import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { LocationService } from './location.service';
import { CreateLocationDto, UpdateLocationDto } from './dto';
import { ReorderDto } from '../reorder/dto';
import { ReorderService } from '../reorder/reorder.service';
import { JwtAuthGuard, TenantGuard } from '../../common/guards';
import { CurrentTenant } from '../../common/decorators';
import { LocationLevel } from '../../database/entities';

@Controller('api/dashboard/locations')
@UseGuards(JwtAuthGuard, TenantGuard)
export class LocationController {
  constructor(
    private readonly locationService: LocationService,
    private readonly reorderService: ReorderService,
  ) {}

  @Get()
  async findAll(@CurrentTenant() tenantId: number, @Query('level') level?: LocationLevel) {
    return this.locationService.findAll(tenantId, level);
  }

  @Get('tree')
  async findTree(@CurrentTenant() tenantId: number) {
    return this.locationService.findTree(tenantId);
  }

  @Put('reorder')
  async reorder(@CurrentTenant() tenantId: number, @Body() dto: ReorderDto) {
    return this.reorderService.reorderLocations(tenantId, dto);
  }

  @Get(':id')
  async findOne(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.locationService.findOne(tenantId, id);
  }

  @Post()
  async create(@CurrentTenant() tenantId: number, @Body() dto: CreateLocationDto) {
    return this.locationService.create(tenantId, dto);
  }

  @Put(':id')
  async update(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLocationDto) {
    return this.locationService.update(tenantId, id, dto);
  }

  @Delete(':id')
  async remove(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    await this.locationService.remove(tenantId, id);
    return { success: true };
  }
}
