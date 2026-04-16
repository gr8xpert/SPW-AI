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
import { CreateClientDto, UpdateClientDto, QueryClientsDto, ExtendSubscriptionDto, ManualActivationDto, GenerateLicenseKeyDto, CreatePlanDto, UpdatePlanDto } from './dto';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators';
import { UserRole, JwtPayload } from '@spw/shared';

@Controller('api/super-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

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
}
