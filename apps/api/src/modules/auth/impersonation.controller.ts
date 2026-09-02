import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImpersonationService } from './impersonation.service';
import { CurrentUser, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { AuthGuard } from '@nestjs/passport';
import { UserRole, JwtPayload } from '@spm/shared';
import { ImpersonationAudit } from '../../database/entities';

@Controller('api')
@UseGuards(AuthGuard('jwt'))
export class ImpersonationController {
  constructor(
    private readonly impersonationService: ImpersonationService,
    @InjectRepository(ImpersonationAudit)
    private readonly auditRepository: Repository<ImpersonationAudit>,
  ) {}

  // Start a "login as client" session. Returns a fresh short-lived JWT
  // scoped to the target tenant plus session metadata for the UI banner.
  // The dashboard should replace its stored access token with this one
  // and stash the original elsewhere (localStorage under a different key)
  // so end-impersonation can restore it without re-logging in.
  @Post('super-admin/impersonate/:tenantId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async impersonate(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.impersonationService.startImpersonation(user, tenantId, {
      ip: req?.ip,
      userAgent: (req?.headers?.['user-agent'] ?? '').toString(),
    });
  }

  // Return to the super-admin's own session. Must be called with the
  // impersonation token — plain super-admin tokens are rejected (nothing
  // to end).
  @Post('auth/end-impersonation')
  async endImpersonation(@CurrentUser() user: JwtPayload) {
    return this.impersonationService.endImpersonation(user);
  }

  // Super-admin only: list impersonation audit rows. Optional filters
  // narrow to a specific tenant or super-admin operator. Paginated so a
  // busy log stays responsive.
  @Get('super-admin/impersonation-audit')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async listAudit(
    @Query('tenantId') tenantId?: string,
    @Query('superAdminUserId') superAdminUserId?: string,
    @Query('sessionId') sessionId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = Math.max(parseInt(page || '1', 10), 1);
    const limitNum = Math.min(Math.max(parseInt(limit || '50', 10), 1), 200);

    const qb = this.auditRepository
      .createQueryBuilder('a')
      .orderBy('a.createdAt', 'DESC');
    if (tenantId) qb.andWhere('a.tenantId = :tenantId', { tenantId: parseInt(tenantId, 10) });
    if (superAdminUserId)
      qb.andWhere('a.superAdminUserId = :superAdminUserId', {
        superAdminUserId: parseInt(superAdminUserId, 10),
      });
    if (sessionId) qb.andWhere('a.sessionId = :sessionId', { sessionId });

    const [data, total] = await qb
      .skip((pageNum - 1) * limitNum)
      .take(limitNum)
      .getManyAndCount();

    return {
      data,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  }
}
