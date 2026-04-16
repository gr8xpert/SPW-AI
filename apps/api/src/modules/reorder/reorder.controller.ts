import { Controller, Put, Body, UseGuards } from '@nestjs/common';
import { ReorderService } from './reorder.service';
import { ReorderDto } from './dto';
import { JwtAuthGuard, TenantGuard } from '../../common/guards';
import { CurrentTenant } from '../../common/decorators';

@Controller('api/dashboard')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ReorderController {
  constructor(private readonly reorderService: ReorderService) {}

  @Put('locations/reorder')
  async reorderLocations(
    @CurrentTenant() tenantId: number,
    @Body() dto: ReorderDto,
  ) {
    return this.reorderService.reorderLocations(tenantId, dto);
  }

  @Put('property-types/reorder')
  async reorderPropertyTypes(
    @CurrentTenant() tenantId: number,
    @Body() dto: ReorderDto,
  ) {
    return this.reorderService.reorderPropertyTypes(tenantId, dto);
  }

  @Put('features/reorder')
  async reorderFeatures(
    @CurrentTenant() tenantId: number,
    @Body() dto: ReorderDto,
  ) {
    return this.reorderService.reorderFeatures(tenantId, dto);
  }

  @Put('location-groups/reorder')
  async reorderLocationGroups(
    @CurrentTenant() tenantId: number,
    @Body() dto: ReorderDto,
  ) {
    return this.reorderService.reorderLocationGroups(tenantId, dto);
  }

  @Put('property-type-groups/reorder')
  async reorderPropertyTypeGroups(
    @CurrentTenant() tenantId: number,
    @Body() dto: ReorderDto,
  ) {
    return this.reorderService.reorderPropertyTypeGroups(tenantId, dto);
  }

  @Put('feature-groups/reorder')
  async reorderFeatureGroups(
    @CurrentTenant() tenantId: number,
    @Body() dto: ReorderDto,
  ) {
    return this.reorderService.reorderFeatureGroups(tenantId, dto);
  }
}
