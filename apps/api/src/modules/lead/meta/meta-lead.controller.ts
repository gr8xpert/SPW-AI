import { Body, Controller, Get, HttpCode, Post, Put, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { DashboardAddonGuard, JwtAuthGuard, RolesGuard, TenantGuard } from '../../../common/guards';
import { CurrentTenant, RequiresAddon, Roles } from '../../../common/decorators';
import { MetaLeadService } from './meta-lead.service';

class MetaSettingsDto {
  @IsOptional() @IsString() @MaxLength(30)
  pageId?: string;

  // Write-only. '' or missing = keep the stored token, null = remove it.
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(1000)
  accessToken?: string | null;

  @IsOptional() @IsBoolean()
  enabled?: boolean;
}

// Facebook & Instagram lead forms (milestone K), managers only. Registered
// before BuyerController so 'meta' is not read as a buyer id.
@Controller('api/dashboard/buyers/meta')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard, RolesGuard)
@RequiresAddon('buyerMatch')
@Roles('admin')
export class MetaLeadController {
  constructor(private readonly meta: MetaLeadService) {}

  @Get()
  get(@CurrentTenant() tenantId: number) {
    return this.meta.get(tenantId);
  }

  @Put()
  save(@CurrentTenant() tenantId: number, @Body() dto: MetaSettingsDto) {
    return this.meta.save(tenantId, dto);
  }

  @Post('test')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  test(@CurrentTenant() tenantId: number) {
    return this.meta.test(tenantId);
  }

  @Post('import')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  import(@CurrentTenant() tenantId: number) {
    return this.meta.importTenant(tenantId);
  }
}
