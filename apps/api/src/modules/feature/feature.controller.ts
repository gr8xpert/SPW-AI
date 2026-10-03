import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { FeatureService } from './feature.service';
import { CreateFeatureDto, UpdateFeatureDto } from './dto';
import { ReorderDto } from '../reorder/dto';
import { ReorderService } from '../reorder/reorder.service';
import { TenantService } from '../tenant/tenant.service';
import { JwtAuthGuard, TenantGuard } from '../../common/guards';
import { CurrentTenant } from '../../common/decorators';
import { FeatureCategory } from '../../database/entities';

// Feature names and order are public (widget filters, WP plugin). Every write
// here ends with one syncVersion bump so those caches refetch.
@Controller('api/dashboard/features')
@UseGuards(JwtAuthGuard, TenantGuard)
export class FeatureController {
  constructor(
    private readonly featureService: FeatureService,
    private readonly reorderService: ReorderService,
    private readonly tenantService: TenantService,
  ) {}

  private bump(tenantId: number, reason: string): Promise<void> {
    return this.tenantService.bumpSyncVersionSafely(tenantId, `feature ${reason}`);
  }

  @Get()
  async findAll(@CurrentTenant() tenantId: number, @Query('category') category?: FeatureCategory) {
    return this.featureService.findAll(tenantId, category);
  }

  @Put('reorder')
  async reorder(@CurrentTenant() tenantId: number, @Body() dto: ReorderDto) {
    const result = await this.reorderService.reorderFeatures(tenantId, dto);
    if (result.updated > 0) await this.bump(tenantId, 'reorder');
    return result;
  }

  @Put('bulk-delete')
  async bulkDelete(@CurrentTenant() tenantId: number, @Body() dto: { ids: number[] }) {
    const result = await this.featureService.bulkDelete(tenantId, dto.ids || []);
    if ((dto.ids || []).length > 0) await this.bump(tenantId, 'bulk delete');
    return result;
  }

  @Get(':id')
  async findOne(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.featureService.findOne(tenantId, id);
  }

  @Post()
  async create(@CurrentTenant() tenantId: number, @Body() dto: CreateFeatureDto) {
    const feature = await this.featureService.create(tenantId, dto);
    await this.bump(tenantId, 'create');
    return feature;
  }

  @Put(':id')
  async update(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFeatureDto) {
    const feature = await this.featureService.update(tenantId, id, dto);
    await this.bump(tenantId, 'update');
    return feature;
  }

  @Delete(':id')
  async remove(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    await this.featureService.remove(tenantId, id);
    await this.bump(tenantId, 'delete');
    return { success: true };
  }
}
