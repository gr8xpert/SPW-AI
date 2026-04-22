import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { FeatureService } from './feature.service';
import { CreateFeatureDto, UpdateFeatureDto } from './dto';
import { ReorderDto } from '../reorder/dto';
import { ReorderService } from '../reorder/reorder.service';
import { JwtAuthGuard, TenantGuard } from '../../common/guards';
import { CurrentTenant } from '../../common/decorators';
import { FeatureCategory } from '../../database/entities';

@Controller('api/dashboard/features')
@UseGuards(JwtAuthGuard, TenantGuard)
export class FeatureController {
  constructor(
    private readonly featureService: FeatureService,
    private readonly reorderService: ReorderService,
  ) {}

  @Get()
  async findAll(@CurrentTenant() tenantId: number, @Query('category') category?: FeatureCategory) {
    return this.featureService.findAll(tenantId, category);
  }

  @Put('reorder')
  async reorder(@CurrentTenant() tenantId: number, @Body() dto: ReorderDto) {
    return this.reorderService.reorderFeatures(tenantId, dto);
  }

  @Get(':id')
  async findOne(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.featureService.findOne(tenantId, id);
  }

  @Post()
  async create(@CurrentTenant() tenantId: number, @Body() dto: CreateFeatureDto) {
    return this.featureService.create(tenantId, dto);
  }

  @Put(':id')
  async update(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFeatureDto) {
    return this.featureService.update(tenantId, id, dto);
  }

  @Delete(':id')
  async remove(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    await this.featureService.remove(tenantId, id);
    return { success: true };
  }
}
