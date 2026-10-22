import { Controller, Get } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators';
import { LeadService } from './lead.service';

// The dashboard home's buyer count. Open to every client, Buyer Match or not
// (the buyers themselves live behind api/dashboard/buyers).
@Controller('api/dashboard/leads')
export class LeadStatsController {
  constructor(private readonly leadService: LeadService) {}

  @Get('stats')
  getStats(@CurrentTenant() tenantId: number) {
    return this.leadService.getStats(tenantId);
  }
}
