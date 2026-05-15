import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { PropertyService } from './property.service';
import { CreatePropertyDto, UpdatePropertyDto, SearchPropertyDto, ListPropertyDto, LockFieldsDto, UnlockFieldsDto } from './dto';
import { JwtAuthGuard, TenantGuard, DashboardAddonGuard } from '../../common/guards';
import { CurrentTenant, CurrentUser, RequiresAddon } from '../../common/decorators';

@Controller('api/dashboard/properties')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard)
export class PropertyController {
  constructor(private readonly propertyService: PropertyService) {}

  @Get()
  async findAll(@CurrentTenant() tenantId: number, @Query() dto: ListPropertyDto) {
    return this.propertyService.findAllPaginated(tenantId, dto);
  }

  @Get('search')
  async search(@CurrentTenant() tenantId: number, @Query() dto: SearchPropertyDto) {
    return this.propertyService.search(tenantId, dto);
  }

  @Get(':id')
  async findOne(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.propertyService.findOne(tenantId, id);
  }

  // Only the manual-create path is gated by the `addProperty` add-on.
  // Reads/updates/deletes/lock toggles stay unguarded so a downgraded tenant
  // can still manage the rows they already have (and that feed imports
  // continue to maintain).
  @Post()
  @RequiresAddon('addProperty')
  async create(@CurrentTenant() tenantId: number, @Body() dto: CreatePropertyDto) {
    return this.propertyService.create(tenantId, dto);
  }

  @Put(':id')
  async update(@CurrentTenant() tenantId: number, @CurrentUser('id') userId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePropertyDto) {
    return this.propertyService.update(tenantId, id, dto, userId);
  }

  @Delete(':id')
  async remove(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    await this.propertyService.remove(tenantId, id);
    return { success: true };
  }

  @Post(':id/lock')
  async lockFields(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: LockFieldsDto) {
    return this.propertyService.lockFields(tenantId, id, dto.fields);
  }

  @Post(':id/unlock')
  async unlockFields(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: UnlockFieldsDto) {
    return this.propertyService.unlockFields(tenantId, id, dto.fields);
  }

  @Post(':id/sold')
  async markAsSold(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.propertyService.markAsSold(tenantId, id);
  }
}
