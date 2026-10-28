import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@spm/shared';
import { JwtAuthGuard, TenantGuard, RolesGuard } from '../../common/guards';
import { CurrentTenant, Roles } from '../../common/decorators';
import { ApiKeyService } from './api-key.service';
import { AiScopeDto, CreateApiKeyDto, PreviewScopeDto, UpdateApiKeyDto } from './dto/api-key.dto';

// Settings -> API Keys: the client's extra website keys. Anyone on the team
// can look; creating, changing and revoking keys is for admins, like rotating
// the main key.
@Controller('api/dashboard/api-keys')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ApiKeyController {
  constructor(private readonly apiKeys: ApiKeyService) {}

  @Get()
  list(@CurrentTenant() tenantId: number) {
    return this.apiKeys.list(tenantId);
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(@CurrentTenant() tenantId: number, @Body() dto: PreviewScopeDto) {
    return this.apiKeys.preview(tenantId, dto.scope);
  }

  @Post('ai-scope')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  aiScope(@CurrentTenant() tenantId: number, @Body() dto: AiScopeDto) {
    return this.apiKeys.aiScope(tenantId, dto.text);
  }

  // Website keys worth having, from how the stock splits (AI).
  @Post('suggest')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  suggest(@CurrentTenant() tenantId: number) {
    return this.apiKeys.suggest(tenantId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  create(@CurrentTenant() tenantId: number, @Body() dto: CreateApiKeyDto) {
    return this.apiKeys.create(tenantId, dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  update(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateApiKeyDto) {
    return this.apiKeys.update(tenantId, id, dto);
  }

  @Post(':id/rotate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  rotate(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.apiKeys.rotate(tenantId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async remove(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    await this.apiKeys.remove(tenantId, id);
  }
}

// Super Admin -> client page: the client's website keys at a glance (names,
// limits, last used, views and enquiries). Read-only; changes go through
// View as client, which bypasses every lock.
@Controller('api/super-admin/clients/:id/api-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class SuperAdminApiKeyController {
  constructor(private readonly apiKeys: ApiKeyService) {}

  @Get()
  list(@Param('id', ParseIntPipe) tenantId: number) {
    return this.apiKeys.list(tenantId);
  }
}
