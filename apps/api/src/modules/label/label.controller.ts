import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { LabelService } from './label.service';
import { CreateLabelDto, UpdateLabelDto } from './dto';
import { TenantService } from '../tenant/tenant.service';
import { JwtAuthGuard, TenantGuard } from '../../common/guards';
import { CurrentTenant } from '../../common/decorators';

// Edits bump syncVersion: the widget keeps labels in IndexedDB and the WP
// plugin in its saved bundle, both refreshed only when syncVersion moves —
// without it a label translated here never reached the website.
@Controller('api/dashboard/labels')
@UseGuards(JwtAuthGuard, TenantGuard)
export class LabelController {
  constructor(
    private readonly labelService: LabelService,
    private readonly tenantService: TenantService,
  ) {}

  private bump(tenantId: number, reason: string): Promise<void> {
    return this.tenantService.bumpSyncVersionSafely(tenantId, `label ${reason}`);
  }

  // Creating the default rows changes nothing on the site (the widget already
  // gets every default), so opening this page doesn't bump.
  @Get()
  async findAll(@CurrentTenant() tenantId: number) {
    await this.labelService.initializeDefaultLabels(tenantId);
    return this.labelService.findAll(tenantId);
  }

  @Get(':id')
  async findOne(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.labelService.findOne(tenantId, id);
  }

  @Post()
  async create(@CurrentTenant() tenantId: number, @Body() dto: CreateLabelDto) {
    const label = await this.labelService.create(tenantId, dto);
    await this.bump(tenantId, `create ${label.key}`);
    return label;
  }

  @Post('initialize')
  async initialize(@CurrentTenant() tenantId: number) {
    await this.labelService.initializeDefaultLabels(tenantId);
    return { success: true, message: 'Default labels initialized' };
  }

  @Put(':id')
  async update(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLabelDto) {
    const label = await this.labelService.update(tenantId, id, dto);
    await this.bump(tenantId, `update ${label.key}`);
    return label;
  }

  @Delete(':id')
  async remove(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    await this.labelService.remove(tenantId, id);
    await this.bump(tenantId, `delete ${id}`);
    return { success: true };
  }
}
