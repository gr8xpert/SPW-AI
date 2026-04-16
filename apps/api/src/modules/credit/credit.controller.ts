import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { CreditService } from './credit.service';
import { AdjustCreditDto, ConsumeCreditDto } from './dto';
import { JwtAuthGuard, TenantGuard, RolesGuard } from '../../common/guards';
import { CurrentTenant, CurrentUser } from '../../common/decorators';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole, JwtPayload } from '@spw/shared';

// ============ DASHBOARD (Tenant-scoped) ENDPOINTS ============

@Controller('api/dashboard/credits')
@UseGuards(JwtAuthGuard, TenantGuard)
export class CreditDashboardController {
  constructor(private readonly creditService: CreditService) {}

  @Get('balance')
  async getBalance(@CurrentTenant() tenantId: number) {
    return this.creditService.getBalance(tenantId);
  }

  @Get('history')
  async getHistory(
    @CurrentTenant() tenantId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.creditService.getHistory(
      tenantId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }
}

// ============ SUPER ADMIN ENDPOINTS ============

@Controller('api/super-admin/credits')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class CreditAdminController {
  constructor(private readonly creditService: CreditService) {}

  @Get()
  async getAllBalances() {
    return this.creditService.getAllBalances();
  }

  @Get(':tenantId')
  async getTenantBalance(@Param('tenantId', ParseIntPipe) tenantId: number) {
    return this.creditService.getBalance(tenantId);
  }

  @Get(':tenantId/history')
  async getTenantHistory(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.creditService.getHistory(
      tenantId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Post(':tenantId/adjust')
  async adjustCredits(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Body() dto: AdjustCreditDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.creditService.adjustCredits(tenantId, dto, user.sub);
  }
}

// ============ WEBMASTER ENDPOINTS ============

@Controller('api/webmaster/credits')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.WEBMASTER)
export class CreditWebmasterController {
  constructor(private readonly creditService: CreditService) {}

  @Post('consume')
  async consumeCredits(
    @Body() dto: ConsumeCreditDto & { tenantId: number },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.creditService.consumeCredits(dto.tenantId, dto, user.sub);
  }
}
