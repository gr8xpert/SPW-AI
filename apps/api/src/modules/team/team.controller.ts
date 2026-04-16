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
import { InviteUserDto, UpdateUserDto, ChangePasswordDto, ResetPasswordDto } from './dto';
import { JwtAuthGuard, TenantGuard } from '../../common/guards';
import { CurrentTenant, CurrentUser } from '../../common/decorators';
import { JwtPayload } from '@spw/shared';

@Controller('api/dashboard/team')
@UseGuards(JwtAuthGuard, TenantGuard)
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get()
  async getTeamMembers(@CurrentTenant() tenantId: number) {
    return this.teamService.getTeamMembers(tenantId);
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

  @Post('invite')
  async inviteUser(
    @CurrentTenant() tenantId: number,
    @Body() dto: InviteUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.teamService.inviteUser(tenantId, dto, user.sub);
  }

  @Put(':id')
  async updateUser(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) userId: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.teamService.updateUser(tenantId, userId, dto, user.sub);
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
