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
import { JwtAuthGuard, TenantGuard } from '../../common/guards';
import { CurrentTenant } from '../../common/decorators';

@Controller('api/dashboard/property-types')
@UseGuards(JwtAuthGuard, TenantGuard)
export class PropertyTypeController {
  constructor(private readonly propertyTypeService: PropertyTypeService) {}

  @Get()
  async findAll(@CurrentTenant() tenantId: number) {
    return this.propertyTypeService.findAll(tenantId);
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
    return this.propertyTypeService.create(tenantId, dto);
  }

  @Put(':id')
  async update(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePropertyTypeDto,
  ) {
    return this.propertyTypeService.update(tenantId, id, dto);
  }

  @Delete(':id')
  async remove(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.propertyTypeService.remove(tenantId, id);
    return { success: true };
  }
}
