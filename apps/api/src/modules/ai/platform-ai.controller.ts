import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserRole } from '@spm/shared';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles } from '../../common/decorators/roles.decorator';
import { AnthropicBudgetService } from './anthropic-budget.service';

// Super Admin dashboard: which account pays for platform AI right now, and
// how much of this month's Anthropic credit is used.
@Controller('api/super-admin/ai')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class PlatformAiController {
  constructor(private readonly budget: AnthropicBudgetService) {}

  @Get('platform')
  platform() {
    return this.budget.status();
  }
}
