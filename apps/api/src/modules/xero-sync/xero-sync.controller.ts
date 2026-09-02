import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { XeroSyncService } from './xero-sync.service';
import { XeroInvoiceLog } from '../../database/entities';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, Public } from '../../common/decorators';
import { UserRole } from '@spm/shared';

// Callback from n8n after it creates the Xero invoice. Public route with
// bearer-token auth (constant-time compare) — same pattern as the ticket
// inbound webhook. Kept minimal because n8n owns the Xero side entirely;
// we just want the invoice id back for our reconciliation log.
@Controller('api/internal/xero')
export class XeroInternalController {
  constructor(
    private readonly config: ConfigService,
    private readonly xeroSyncService: XeroSyncService,
  ) {}

  @Post('invoice-created')
  @Public()
  async invoiceCreated(
    @Body() body: { stripeSessionId?: string; xeroInvoiceId?: string; invoiceUrl?: string },
    @Headers('authorization') auth: string | undefined,
  ) {
    this.verifyAuth(auth);

    const stripeSessionId = (body.stripeSessionId || '').trim();
    const xeroInvoiceId = (body.xeroInvoiceId || '').trim();
    if (!stripeSessionId || !xeroInvoiceId) {
      throw new BadRequestException('stripeSessionId and xeroInvoiceId required');
    }
    const saved = await this.xeroSyncService.recordConfirmation({
      stripeSessionId,
      xeroInvoiceId,
      invoiceUrl: body.invoiceUrl,
    });
    return { ok: !!saved, logId: saved?.id ?? null };
  }

  private verifyAuth(auth: string | undefined): void {
    const secret = this.config.get<string>('XERO_N8N_SECRET');
    if (!secret) {
      // No secret configured → refuse all callbacks. Safer to 401 than to
      // silently accept anonymous confirmations that could poison the log.
      throw new UnauthorizedException('Xero callback secret not configured');
    }
    const provided = (auth || '').replace(/^Bearer\s+/i, '').trim();
    if (provided !== secret) {
      throw new UnauthorizedException('Invalid Xero callback secret');
    }
  }
}

// Super-admin view of the sync log. Read-only listing + manual retry.
@Controller('api/super-admin/xero-sync')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class XeroSyncAdminController {
  constructor(
    @InjectRepository(XeroInvoiceLog)
    private readonly logRepository: Repository<XeroInvoiceLog>,
    private readonly xeroSyncService: XeroSyncService,
  ) {}

  @Get()
  async list(
    @Query('status') status?: string,
    @Query('tenantId') tenantId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = Math.max(parseInt(page || '1', 10), 1);
    const limitNum = Math.min(Math.max(parseInt(limit || '25', 10), 1), 200);

    const qb = this.logRepository.createQueryBuilder('l').orderBy('l.createdAt', 'DESC');
    if (status) qb.andWhere('l.status = :status', { status });
    if (tenantId) qb.andWhere('l.tenantId = :tenantId', { tenantId: parseInt(tenantId, 10) });

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

  @Post(':id/retry')
  async retry(@Param('id', ParseIntPipe) id: number) {
    const row = await this.xeroSyncService.retry(id);
    return { ok: true, row };
  }
}
