import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { LocationService } from './location.service';
import { LocationGeocodeService } from './location-geocode.service';
import { CreateLocationDto, MergeLocationDto, UpdateLocationDto } from './dto';
import { ReorderDto, SortAllDto } from '../reorder/dto';
import { ReorderService } from '../reorder/reorder.service';
import { TenantService } from '../tenant/tenant.service';
import { JwtAuthGuard, TenantGuard } from '../../common/guards';
import { CurrentTenant } from '../../common/decorators';
import { LocationLevel } from '../../database/entities';

// Location names, tree and order are public (widget filters, WP plugin).
// Every write here ends with one syncVersion bump so those caches refetch.
// The bump lives in the controller, not LocationService, because the service
// methods are also used row by row by feed imports and template re-apply,
// which bump once for the whole run themselves.
@Controller('api/dashboard/locations')
@UseGuards(JwtAuthGuard, TenantGuard)
export class LocationController {
  constructor(
    private readonly locationService: LocationService,
    private readonly reorderService: ReorderService,
    private readonly geocodeService: LocationGeocodeService,
    private readonly tenantService: TenantService,
  ) {}

  private bump(tenantId: number, reason: string): Promise<void> {
    return this.tenantService.bumpSyncVersionSafely(tenantId, `location ${reason}`);
  }

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
    const outcome = await this.geocodeService.run(tenantId, missing === 'true' || missing === '1');
    // Points drive the public map; only a run that moved one changed anything.
    if (outcome.fixed.length > 0) await this.bump(tenantId, 'geocode');
    return outcome;
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
    const result = await this.reorderService.reorderLocations(tenantId, dto);
    if (result.updated > 0) await this.bump(tenantId, 'reorder');
    return result;
  }

  // Sort menu: A–Z (clears the manual order), Z–A or most listings first.
  @Put('sort')
  async sortAll(@CurrentTenant() tenantId: number, @Body() dto: SortAllDto) {
    const result = await this.reorderService.sortAll('location', tenantId, dto.by);
    await this.bump(tenantId, `sort ${dto.by}`);
    return result;
  }

  @Put('bulk-move')
  async bulkMove(@CurrentTenant() tenantId: number, @Body() dto: { ids: number[]; parentId: number | null }) {
    await this.locationService.rememberOrigins(tenantId, dto.ids || []);
    const result = await this.locationService.bulkMove(tenantId, dto.ids || [], dto.parentId ?? null);
    await this.locationService.markUserLocked(tenantId, dto.ids || []);
    if (result.count > 0) await this.bump(tenantId, 'bulk move');
    return result;
  }

  @Put('bulk-delete')
  async bulkDelete(@CurrentTenant() tenantId: number, @Body() dto: { ids: number[] }) {
    const result = await this.locationService.bulkDelete(tenantId, dto.ids || []);
    if (result.count > 0) await this.bump(tenantId, 'bulk delete');
    return result;
  }

  @Get(':id')
  async findOne(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.locationService.findOne(tenantId, id);
  }

  @Post()
  async create(@CurrentTenant() tenantId: number, @Body() dto: CreateLocationDto) {
    const location = await this.locationService.create(tenantId, dto);
    await this.locationService.markUserLocked(tenantId, [location.id]);
    const coordsLocked = location.lat != null && location.lng != null;
    if (coordsLocked) await this.locationService.markCoordsLocked(tenantId, location.id);
    await this.bump(tenantId, 'create');
    return { ...location, userLocked: true, coordsLocked };
  }

  @Put(':id')
  async update(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLocationDto) {
    const before = await this.locationService.findOne(tenantId, id);
    const movingOrRenaming =
      (dto.parentId !== undefined && (dto.parentId ?? null) !== before.parentId) ||
      (dto.name?.en !== undefined && dto.name.en !== before.name?.en);
    if (movingOrRenaming) await this.locationService.rememberOrigins(tenantId, [id]);
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
    // The form always sends lat/lng; only a changed value is the client's own.
    const coord = (v: unknown) => (v == null || v === '' ? null : Number(Number(v).toFixed(5)));
    const coordsChanged =
      (dto.lat !== undefined && coord(dto.lat) !== coord(before.lat)) ||
      (dto.lng !== undefined && coord(dto.lng) !== coord(before.lng));
    if (coordsChanged && !location.coordsLocked) {
      await this.locationService.markCoordsLocked(tenantId, location.id);
      location.coordsLocked = true;
    }
    await this.bump(tenantId, 'update');
    return location;
  }

  // "Merge into…": this location's listings and places move into the target.
  @Post(':id/merge')
  async merge(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MergeLocationDto,
  ) {
    const merged = await this.locationService.mergeLocations(tenantId, id, dto.targetId);
    await this.bump(tenantId, 'merge');
    return merged;
  }

  @Delete(':id')
  async remove(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    await this.locationService.remove(tenantId, id);
    await this.bump(tenantId, 'delete');
    return { success: true };
  }
}
