import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { EmailDomainService } from './email-domain.service';
import {
  JwtAuthGuard,
  TenantGuard,
  RolesGuard,
} from '../../common/guards';
import { CurrentTenant, Roles } from '../../common/decorators';
import { UserRole } from '@spw/shared';
import { SetEmailDomainDto } from './dto/set-email-domain.dto';

// Powers the dashboard "Sender Domain" panel (5R). All endpoints are
// tenant-scoped and restricted to tenant admins — rotating the DKIM
// keypair or deleting the row invalidates the DNS records the tenant
// has published, so this is a privileged op.
@Controller('api/dashboard/tenant/email-domain')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class EmailDomainController {
  constructor(private readonly service: EmailDomainService) {}

  // Returns null-shaped absence with a 200 rather than 404 so the
  // dashboard's initial load doesn't toast an error when the tenant
  // simply hasn't configured one yet. Saves a round-trip: the UI can
  // decide between "show config form" vs "show records + verify" based
  // on this single response.
  @Get()
  async getCurrent(@CurrentTenant() tenantId: number) {
    try {
      return await this.service.getByTenant(tenantId);
    } catch (e) {
      if (e instanceof NotFoundException) return null;
      throw e;
    }
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  async upsert(
    @CurrentTenant() tenantId: number,
    @Body() dto: SetEmailDomainDto,
  ) {
    return this.service.upsert(tenantId, dto.domain);
  }

  // On-demand verify — the dashboard calls this when the tenant has
  // added the records on their DNS host and wants confirmation. The
  // result carries both the aggregate status and per-record diagnostics
  // so we can render "SPF ok / DKIM missing / DMARC malformed".
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@CurrentTenant() tenantId: number) {
    return this.service.verify(tenantId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentTenant() tenantId: number) {
    await this.service.remove(tenantId);
  }
}
