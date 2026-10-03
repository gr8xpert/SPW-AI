import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { PropertyTypeService } from './property-type.service';
import { CreatePropertyTypeDto, UpdatePropertyTypeDto } from './dto';
import { ReorderDto } from '../reorder/dto';
import { ReorderService } from '../reorder/reorder.service';
import { TenantService } from '../tenant/tenant.service';
import { JwtAuthGuard, TenantGuard } from '../../common/guards';
import { CurrentTenant } from '../../common/decorators';

// Type names, tree and order are public (widget filters, WP plugin). Every
// write here ends with one syncVersion bump so those caches refetch. The bump
// is in the controller, not the service, because feed imports, template
// re-apply and AI Organize call the service row by row and bump once per run.
@Controller('api/dashboard/property-types')
@UseGuards(JwtAuthGuard, TenantGuard)
export class PropertyTypeController {
  constructor(
    private readonly propertyTypeService: PropertyTypeService,
    private readonly reorderService: ReorderService,
    private readonly tenantService: TenantService,
  ) {}

  private bump(tenantId: number, reason: string): Promise<void> {
    return this.tenantService.bumpSyncVersionSafely(tenantId, `property type ${reason}`);
  }

  @Get()
  async findAll(@CurrentTenant() tenantId: number) {
    return this.propertyTypeService.findAll(tenantId);
  }

  @Put('reorder')
  async reorder(@CurrentTenant() tenantId: number, @Body() dto: ReorderDto) {
    const result = await this.reorderService.reorderPropertyTypes(tenantId, dto);
    if (result.updated > 0) await this.bump(tenantId, 'reorder');
    return result;
  }

  @Put('bulk-move')
  async bulkMove(@CurrentTenant() tenantId: number, @Body() dto: { ids: number[]; parentId: number | null }) {
    const result = await this.propertyTypeService.bulkMove(tenantId, dto.ids || [], dto.parentId ?? null);
    await this.propertyTypeService.markUserLocked(tenantId, dto.ids || []);
    if ((dto.ids || []).length > 0) await this.bump(tenantId, 'bulk move');
    return result;
  }

  @Put('bulk-delete')
  async bulkDelete(@CurrentTenant() tenantId: number, @Body() dto: { ids: number[] }) {
    const result = await this.propertyTypeService.bulkDelete(tenantId, dto.ids || []);
    if ((dto.ids || []).length > 0) await this.bump(tenantId, 'bulk delete');
    return result;
  }

  @Get(':id')
  async findOne(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.propertyTypeService.findOne(tenantId, id);
  }

  @Post()
  async create(
    @CurrentTenant() tenantId: number,
    @Body() dto: CreatePropertyTypeDto,
  ) {
    const type = await this.propertyTypeService.create(tenantId, dto);
    await this.propertyTypeService.markUserLocked(tenantId, [type.id]);
    await this.bump(tenantId, 'create');
    return { ...type, userLocked: true };
  }

  @Put(':id')
  async update(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePropertyTypeDto,
  ) {
    const before = await this.propertyTypeService.findOne(tenantId, id);
    if (dto.name?.en !== undefined && dto.name.en !== before.name?.en) {
      await this.propertyTypeService.rememberFeedName(tenantId, before);
    }
    const type = await this.propertyTypeService.update(tenantId, id, dto);
    // A real move or a new English name locks the row; translations and the
    // visibility toggle don't.
    const moved = dto.parentId !== undefined && (dto.parentId ?? null) !== before.parentId;
    const renamed = dto.name?.en !== undefined && dto.name.en !== before.name?.en;
    if (moved || renamed) {
      await this.propertyTypeService.markUserLocked(tenantId, [id]);
      type.userLocked = true;
    }
    await this.bump(tenantId, 'update');
    return type;
  }

  @Delete(':id')
  async remove(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.propertyTypeService.remove(tenantId, id);
    await this.bump(tenantId, 'delete');
    return { success: true };
  }
}
