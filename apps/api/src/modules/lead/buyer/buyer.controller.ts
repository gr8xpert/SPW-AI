import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtPayload } from '@spm/shared';
import { DashboardAddonGuard, JwtAuthGuard, RolesGuard, TenantGuard } from '../../../common/guards';
import { CurrentTenant, CurrentUser, RequiresAddon, Roles } from '../../../common/decorators';
import { BuyerService } from './buyer.service';
import { BuyerStageService } from './buyer-stage.service';
import { BuyerSettingsService } from './buyer-settings.service';
import { BuyerViewer } from './buyer-access';
import {
  BuyerActivityDto,
  BuyerSettingsDto,
  CreateBuyerDto,
  ListBuyersDto,
  SetStageDto,
  UpdateBuyerDto,
} from './dto/buyer.dto';

// A Super Admin "viewing as" a client acts as that client's user, so new
// buyers and activities belong to a member of the tenant.
export function viewerOf(user: JwtPayload): BuyerViewer {
  return { id: user.impersonatedUserId ?? user.sub, role: user.role, originalRole: user.originalRole };
}

@Controller('api/dashboard/buyers')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard, RolesGuard)
@RequiresAddon('buyerMatch')
export class BuyerController {
  constructor(
    private readonly buyers: BuyerService,
    private readonly stages: BuyerStageService,
    private readonly settings: BuyerSettingsService,
  ) {}

  @Get()
  list(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Query() dto: ListBuyersDto) {
    return this.buyers.list(tenantId, viewerOf(user), dto);
  }

  @Get('agents')
  agents(@CurrentTenant() tenantId: number) {
    return this.buyers.agents(tenantId);
  }

  @Get('stages')
  listStages(@CurrentTenant() tenantId: number) {
    return this.stages.list(tenantId);
  }

  @Get('settings')
  getSettings(@CurrentTenant() tenantId: number) {
    return this.settings.get(tenantId);
  }

  @Put('settings')
  @Roles('admin')
  updateSettings(@CurrentTenant() tenantId: number, @Body() dto: BuyerSettingsDto) {
    return this.settings.update(tenantId, dto);
  }

  @Post()
  create(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Body() dto: CreateBuyerDto) {
    return this.buyers.create(tenantId, viewerOf(user), dto);
  }

  @Get(':id')
  get(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.buyers.get(tenantId, viewerOf(user), id);
  }

  @Put(':id')
  update(
    @CurrentTenant() tenantId: number,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBuyerDto,
  ) {
    return this.buyers.update(tenantId, viewerOf(user), id, dto);
  }

  @Put(':id/stage')
  setStage(
    @CurrentTenant() tenantId: number,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetStageDto,
  ) {
    return this.buyers.setStage(tenantId, viewerOf(user), id, dto.stageId);
  }

  @Get(':id/activities')
  activities(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.buyers.activities(tenantId, viewerOf(user), id);
  }

  @Post(':id/activities')
  addActivity(
    @CurrentTenant() tenantId: number,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BuyerActivityDto,
  ) {
    return this.buyers.addActivity(tenantId, viewerOf(user), id, dto);
  }
}
