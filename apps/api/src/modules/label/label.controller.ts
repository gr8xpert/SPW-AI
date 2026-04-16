import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { LabelService } from './label.service';
import { CreateLabelDto, UpdateLabelDto } from './dto';
import { JwtAuthGuard, TenantGuard } from '../../common/guards';
import { CurrentTenant } from '../../common/decorators';

@Controller('api/dashboard/labels')
@UseGuards(JwtAuthGuard, TenantGuard)
export class LabelController {
  constructor(private readonly labelService: LabelService) {}

  @Get()
  async findAll(@CurrentTenant() tenantId: number) {
    return this.labelService.findAll(tenantId);
  }

  @Get(':id')
  async findOne(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.labelService.findOne(tenantId, id);
  }

  @Post()
  async create(@CurrentTenant() tenantId: number, @Body() dto: CreateLabelDto) {
    return this.labelService.create(tenantId, dto);
  }

  @Post('initialize')
  async initialize(@CurrentTenant() tenantId: number) {
    await this.labelService.initializeDefaultLabels(tenantId);
    return { success: true, message: 'Default labels initialized' };
  }

  @Put(':id')
  async update(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLabelDto) {
    return this.labelService.update(tenantId, id, dto);
  }

  @Delete(':id')
  async remove(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    await this.labelService.remove(tenantId, id);
    return { success: true };
  }
}
