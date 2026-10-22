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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TeamService } from './team.service';
import { AgentsService } from './agents.service';
import { InviteUserDto, AgentDto, ChangePasswordDto, ResetPasswordDto } from './dto';
import { JwtAuthGuard, TenantGuard, DashboardAddonGuard } from '../../common/guards';
import { CurrentTenant, CurrentUser, RequiresAddon } from '../../common/decorators';
import { JwtPayload } from '@spm/shared';

@Controller('api/dashboard/team')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard)
@RequiresAddon('team')
export class TeamController {
  constructor(
    private readonly teamService: TeamService,
    private readonly agentsService: AgentsService,
  ) {}

  @Get()
  async getTeamMembers(@CurrentTenant() tenantId: number) {
    return this.agentsService.list(tenantId);
  }

  @Get('stats')
  async getTeamStats(@CurrentTenant() tenantId: number) {
    return this.teamService.getTeamStats(tenantId);
  }

  @Get(':id')
  async getTeamMember(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) userId: number,
  ) {
    return this.teamService.getTeamMember(tenantId, userId);
  }

  // Agents page: add a person (with or without a dashboard login).
  @Post()
  async createAgent(
    @CurrentTenant() tenantId: number,
    @Body() dto: AgentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.agentsService.create(tenantId, dto, user.sub);
  }

  // The old Team invite (email, name, password, role): a login agent.
  @Post('invite')
  async inviteUser(
    @CurrentTenant() tenantId: number,
    @Body() dto: InviteUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.agentsService.create(
      tenantId,
      { email: dto.email, name: dto.name || dto.email, password: dto.password, access: dto.role === 'admin' ? 'manager' : 'agent' },
      user.sub,
    );
  }

  @Put(':id')
  async updateUser(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) userId: number,
    @Body() dto: AgentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.agentsService.update(tenantId, userId, dto, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeUser(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) userId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.teamService.removeUser(tenantId, userId, user.sub);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentTenant() tenantId: number,
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.teamService.changePassword(tenantId, user.sub, dto);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetUserPassword(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) userId: number,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.teamService.resetUserPassword(tenantId, userId, dto, user.sub);
  }
}
