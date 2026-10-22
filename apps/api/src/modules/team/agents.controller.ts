import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, TenantGuard } from '../../common/guards';
import { CurrentTenant } from '../../common/decorators';
import { AgentsService } from './agents.service';

// Active people for pickers anywhere in the dashboard (property Agent / Sales
// agent, Settings → Website agent). Not behind the Team add-on: only adding
// and editing people is.
@Controller('api/dashboard/agents')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  async options(@CurrentTenant() tenantId: number) {
    return this.agents.options(tenantId);
  }
}
