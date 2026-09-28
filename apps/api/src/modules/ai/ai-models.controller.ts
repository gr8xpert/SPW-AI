import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, TenantGuard } from '../../common/guards';
import { CurrentTenant } from '../../common/decorators';
import { AiService } from './ai.service';

// Settings → AI model dropdown: current recommended models (checked against
// OpenRouter's live list) and whether the tenant's saved model still works.
@Controller('api/dashboard/ai')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AiModelsController {
  constructor(private readonly aiService: AiService) {}

  @Get('models')
  models(@CurrentTenant() tenantId: number) {
    return this.aiService.listModels(tenantId);
  }
}
