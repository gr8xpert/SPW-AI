import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AiSeoService } from './ai-seo.service';
import { GenerateSeoDto } from './dto/generate-seo.dto';
import { CurrentTenant, RequiresAddon } from '../../common/decorators';
import { JwtAuthGuard, TenantGuard, DashboardAddonGuard } from '../../common/guards';

// Server-side gate: same `aiTranslation` add-on that unlocks bulk/inline
// translation also unlocks AI SEO — both consume OpenRouter credits and
// share the "premium AI content" bucket for billing.
@Controller('api/dashboard/ai-seo')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard)
@RequiresAddon('aiTranslation')
export class AiSeoController {
  constructor(private readonly aiSeoService: AiSeoService) {}

  @Post('property/:id')
  async generateForProperty(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GenerateSeoDto,
  ) {
    return this.aiSeoService.generateSeoForProperty(tenantId, id, dto.targetLanguages);
  }

  @Post('property/:id/schema')
  async generateSchemaForProperty(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.aiSeoService.generateSchemaForProperty(tenantId, id);
  }
}
