import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { FeedService } from './feed.service';
import { CreateFeedConfigDto, UpdateFeedConfigDto } from './dto';
import { JwtAuthGuard, TenantGuard } from '../../common/guards';
import { CurrentTenant } from '../../common/decorators';

@Controller('api/dashboard/feeds')
@UseGuards(JwtAuthGuard, TenantGuard)
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get()
  async findAll(@CurrentTenant() tenantId: number) {
    return this.feedService.findAllConfigs(tenantId);
  }

  @Get('providers')
  async getProviders() {
    return [
      { id: 'resales', name: 'Resales Online', available: true },
      { id: 'inmoba', name: 'Inmoba', available: true },
      { id: 'infocasa', name: 'Infocasa', available: false },
      { id: 'redsp', name: 'REDSP', available: false },
    ];
  }

  @Get('logs')
  async getLogs(
    @CurrentTenant() tenantId: number,
    @Query('configId') configId?: number,
  ) {
    return this.feedService.getImportLogs(tenantId, configId);
  }

  @Get(':id')
  async findOne(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.feedService.findConfigById(tenantId, id);
  }

  @Post()
  async create(
    @CurrentTenant() tenantId: number,
    @Body() dto: CreateFeedConfigDto,
  ) {
    return this.feedService.createConfig(tenantId, dto);
  }

  @Put(':id')
  async update(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFeedConfigDto,
  ) {
    return this.feedService.updateConfig(tenantId, id, dto);
  }

  @Delete(':id')
  async remove(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.feedService.deleteConfig(tenantId, id);
    return { success: true };
  }

  @Post(':id/sync')
  async triggerSync(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.feedService.triggerSync(tenantId, id);
  }

  @Get(':id/sync-status')
  async getSyncStatus(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.feedService.getSyncStatus(tenantId, id);
  }
}
