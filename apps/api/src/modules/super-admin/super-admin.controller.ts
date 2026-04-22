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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { RateLimitHeadroomService } from './rate-limit-headroom.service';
import { QueueDepthService } from './queue-depth.service';
import { CreateClientDto, UpdateClientDto, QueryClientsDto, ExtendSubscriptionDto, ManualActivationDto, GenerateLicenseKeyDto, CreatePlanDto, UpdatePlanDto } from './dto';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators';
import { UserRole, JwtPayload } from '@spw/shared';

@Controller('api/super-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class SuperAdminController {
  constructor(
    private readonly superAdminService: SuperAdminService,
    private readonly rateLimitHeadroomService: RateLimitHeadroomService,
    private readonly queueDepthService: QueueDepthService,
  ) {}

  // 5S — rate-limit headroom overview. Lists every active tenant with
  // their current 60s usage vs plan ceiling, sorted busiest-first so ops
  // can spot noisy tenants before they get 429'd.
  @Get('rate-limit-headroom')
  async getRateLimitHeadroom() {
    return this.rateLimitHeadroomService.getHeadroom();
  }

  // 6C — BullMQ queue-depth snapshot. One row per tracked queue
  // (webhook-dispatch, email-campaign, feed-import, migration) with
  // waiting/active/delayed/failed counts and a banded status. Worst-first
  // so ops see the broken queue before the healthy ones.
  @Get('queue-depth')
  async getQueueDepth() {
    return this.queueDepthService.getSnapshot();
  }

  // ============ DASHBOARD ============

  @Get('dashboard')
  async getDashboard() {
    return this.superAdminService.getDashboardStats();
  }

  // ============ CLIENT MANAGEMENT ============

  @Get('clients')
  async listClients(@Query() query: QueryClientsDto) {
    return this.superAdminService.listClients(query);
  }

  @Get('clients/:id')
  async getClient(@Param('id', ParseIntPipe) id: number) {
    return this.superAdminService.getClient(id);
  }

  @Post('clients')
  async createClient(
    @Body() dto: CreateClientDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.superAdminService.createClient(dto, user.sub);
  }

  @Put('clients/:id')
  async updateClient(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.superAdminService.updateClient(id, dto, user.sub);
  }

  @Delete('clients/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteClient(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.superAdminService.deleteClient(id, user.sub);
  }

  // ============ CLIENT ACTIONS ============

  @Post('clients/:id/check-connection')
  async checkConnection(@Param('id', ParseIntPipe) id: number) {
    return this.superAdminService.checkConnection(id);
  }

  @Post('clients/:id/toggle-override')
  async toggleOverride(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.superAdminService.toggleAdminOverride(id, user.sub);
  }

  @Post('clients/:id/manual-activate')
  async manualActivate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ManualActivationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.superAdminService.manualActivation(id, dto, user.sub);
  }

  @Post('clients/:id/extend')
  async extendSubscription(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ExtendSubscriptionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.superAdminService.extendSubscription(id, dto, user.sub);
  }

  // Clears a specific client's widget/plugin cache on behalf of support —
  // bumps syncVersion + emits cache.invalidated so their site stops
  // serving stale listings without waiting for the widget's 5-min TTL.
  @Post('clients/:id/clear-cache')
  @HttpCode(HttpStatus.OK)
  async clearClientCache(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.superAdminService.clearClientCache(id, user.sub);
  }

  // ============ LICENSE KEY MANAGEMENT ============

  @Get('clients/:id/license-keys')
  async getLicenseKeys(@Param('id', ParseIntPipe) id: number) {
    return this.superAdminService.getLicenseKeys(id);
  }

  @Post('clients/:id/license-keys')
  async generateLicenseKey(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GenerateLicenseKeyDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.superAdminService.generateLicenseKey(id, dto, user.sub);
  }

  @Post('clients/:id/license-keys/:keyId/revoke')
  async revokeLicenseKey(
    @Param('id', ParseIntPipe) id: number,
    @Param('keyId', ParseIntPipe) keyId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.superAdminService.revokeLicenseKey(id, keyId, user.sub);
  }

  @Post('clients/:id/license-keys/:keyId/regenerate')
  async regenerateLicenseKey(
    @Param('id', ParseIntPipe) id: number,
    @Param('keyId', ParseIntPipe) keyId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.superAdminService.regenerateLicenseKey(id, keyId, user.sub);
  }

  // ============ PLAN MANAGEMENT ============

  @Get('plans')
  async listPlans() {
    return this.superAdminService.getPlans();
  }

  @Get('plans/stats')
  async getPlanStats() {
    return this.superAdminService.getPlanStats();
  }

  @Get('plans/:id')
  async getPlan(@Param('id', ParseIntPipe) id: number) {
    return this.superAdminService.getPlan(id);
  }

  @Post('plans')
  async createPlan(
    @Body() dto: CreatePlanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.superAdminService.createPlan(dto, user.sub);
  }

  @Put('plans/:id')
  async updatePlan(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.superAdminService.updatePlan(id, dto, user.sub);
  }

  @Delete('plans/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePlan(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.superAdminService.deletePlan(id, user.sub);
  }

  // ============ AUDIT LOG ============

  @Get('audit-logs')
  async getAuditLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('tenantId') tenantId?: string,
    @Query('userId') userId?: string,
  ) {
    return this.superAdminService.getAuditLogs({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
      action,
      entityType,
      tenantId: tenantId ? parseInt(tenantId) : undefined,
      userId: userId ? parseInt(userId) : undefined,
    });
  }

  // ============ EMAIL SUPPRESSIONS ============

  @Get('suppressions')
  async getSuppressions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('tenantId') tenantId?: string,
    @Query('search') search?: string,
  ) {
    return this.superAdminService.getSuppressions({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
      tenantId: tenantId ? parseInt(tenantId) : undefined,
      search,
    });
  }

  @Delete('suppressions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSuppression(@Param('id', ParseIntPipe) id: number) {
    await this.superAdminService.deleteSuppression(id);
  }
}
