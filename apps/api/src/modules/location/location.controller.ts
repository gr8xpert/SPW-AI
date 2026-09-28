import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { LocationService } from './location.service';
import { LocationGeocodeService } from './location-geocode.service';
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
    private readonly geocodeService: LocationGeocodeService,
  ) {}

  /**
   * Put the client's places on the map correctly.
   *
   * Listings that carry no coordinates of their own are drawn at their place's
   * point, so a single wrong row takes every listing in that place with it.
   * Each place is looked up with its parents for context ("Los Alamos,
   * Torremolinos, Malaga, Spain") and the answer is only kept if it lands near
   * its parent — otherwise the old value stays and the reason is reported.
   */
  @Post('geocode')
  async geocode(@CurrentTenant() tenantId: number, @Query('missing') missing?: string) {
    return this.geocodeService.run(tenantId, missing === 'true' || missing === '1');
  }

  @Get()
  async findAll(@CurrentTenant() tenantId: number, @Query('level') level?: LocationLevel) {
    return this.locationService.findAll(tenantId, level);
  }

  @Get('tree')
  async findTree(@CurrentTenant() tenantId: number, @Query('includeInactive') includeInactive?: string) {
    return this.locationService.findTree(tenantId, includeInactive === 'true');
  }

  @Put('reorder')
  async reorder(@CurrentTenant() tenantId: number, @Body() dto: ReorderDto) {
    return this.reorderService.reorderLocations(tenantId, dto);
  }

  @Put('bulk-move')
  async bulkMove(@CurrentTenant() tenantId: number, @Body() dto: { ids: number[]; parentId: number | null }) {
    const result = await this.locationService.bulkMove(tenantId, dto.ids || [], dto.parentId ?? null);
    await this.locationService.markUserLocked(tenantId, dto.ids || []);
    return result;
  }

  @Put('bulk-delete')
  async bulkDelete(@CurrentTenant() tenantId: number, @Body() dto: { ids: number[] }) {
    return this.locationService.bulkDelete(tenantId, dto.ids || []);
  }

  @Get(':id')
  async findOne(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.locationService.findOne(tenantId, id);
  }

  @Post()
  async create(@CurrentTenant() tenantId: number, @Body() dto: CreateLocationDto) {
    const location = await this.locationService.create(tenantId, dto);
    await this.locationService.markUserLocked(tenantId, [location.id]);
    return { ...location, userLocked: true };
  }

  @Put(':id')
  async update(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLocationDto) {
    const before = await this.locationService.findOne(tenantId, id);
    const location = await this.locationService.update(tenantId, id, dto);
    // Only a real move, level change or new English name locks the row —
    // adding a translation or toggling visibility doesn't.
    const moved = dto.parentId !== undefined && (dto.parentId ?? null) !== before.parentId;
    const releveled = dto.level !== undefined && dto.level !== before.level;
    const renamed = dto.name?.en !== undefined && dto.name.en !== before.name?.en;
    if (moved || releveled || renamed || location.id !== id) {
      await this.locationService.markUserLocked(tenantId, [location.id]);
      location.userLocked = true;
    }
    return location;
  }

  @Delete(':id')
  async remove(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    await this.locationService.remove(tenantId, id);
    return { success: true };
  }
}
