import { Controller, Put, Body, UseGuards } from '@nestjs/common';
import { ReorderService } from './reorder.service';
import { ReorderDto } from './dto';
import { JwtAuthGuard, TenantGuard } from '../../common/guards';
import { CurrentTenant } from '../../common/decorators';

// Locations, property types and features reorder through their own
// controllers (same paths), which also bump syncVersion so the website
// refetches the order. Copies of those routes here used to shadow them, so a
// drag in the dashboard never reached the website.
@Controller('api/dashboard')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ReorderController {
  constructor(private readonly reorderService: ReorderService) {}

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
