import { Body, Controller, DefaultValuePipe, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtPayload, UserRole } from '@spm/shared';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, Roles } from '../../common/decorators';
import { CreatePluginLicenseDto, ExtendPluginLicenseDto, RegeneratePluginKeyDto, UpdatePluginLicenseDto } from './dto/plugin-license-admin.dto';
import { AdminStatusFilter, PluginLicenseAdminService } from './plugin-license-admin.service';

const STATUS_FILTERS: AdminStatusFilter[] = ['all', 'active', 'expiring', 'expired', 'revoked'];

// Super admin -> Plugin licences (SPM AI Translator for Polylang). Super admins only.
@Controller('api/super-admin/plugin-licenses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class PluginLicenseAdminController {
  constructor(private readonly admin: PluginLicenseAdminService) {}

  @Get()
  list(
    @Query('q') q = '',
    @Query('status') status = 'all',
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ) {
    const filter = STATUS_FILTERS.includes(status as AdminStatusFilter) ? (status as AdminStatusFilter) : 'all';
    return this.admin.list(String(q).slice(0, 100), filter, page);
  }

  @Get('plans')
  plans() {
    return this.admin.plans();
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.admin.detail(id);
  }

  @Post()
  create(@Body() dto: CreatePluginLicenseDto, @CurrentUser() user: JwtPayload) {
    return this.admin.create(dto, user.sub);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePluginLicenseDto, @CurrentUser() user: JwtPayload) {
    return this.admin.update(id, dto, user.sub);
  }

  @Post(':id/extend')
  @HttpCode(HttpStatus.OK)
  extend(@Param('id', ParseIntPipe) id: number, @Body() dto: ExtendPluginLicenseDto, @CurrentUser() user: JwtPayload) {
    return this.admin.extend(id, dto.months, user.sub);
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  revoke(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.admin.setRevoked(id, true, user.sub);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  restore(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.admin.setRevoked(id, false, user.sub);
  }

  @Post(':id/regenerate-key')
  @HttpCode(HttpStatus.OK)
  regenerate(@Param('id', ParseIntPipe) id: number, @Body() dto: RegeneratePluginKeyDto, @CurrentUser() user: JwtPayload) {
    return this.admin.regenerateKey(id, dto.sendEmail ?? false, user.sub);
  }

  @Delete(':id/sites/:siteId')
  removeSite(@Param('id', ParseIntPipe) id: number, @Param('siteId', ParseIntPipe) siteId: number, @CurrentUser() user: JwtPayload) {
    return this.admin.removeSite(id, siteId, user.sub);
  }
}
