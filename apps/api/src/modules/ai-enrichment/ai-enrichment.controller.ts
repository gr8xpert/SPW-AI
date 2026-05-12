import { Controller, Post, UseGuards, Body } from '@nestjs/common';
import { AiEnrichmentService } from './ai-enrichment.service';
import { JwtAuthGuard, TenantGuard } from '../../common/guards';
import { CurrentTenant } from '../../common/decorators';

@Controller('api/dashboard/ai-enrichment')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AiEnrichmentController {
  constructor(private readonly enrichmentService: AiEnrichmentService) {}

  // Manual trigger from the dashboard "✨ AI organize" buttons.
  // Body.scope picks a subset (defaults to all three).
  @Post('run')
  async run(
    @CurrentTenant() tenantId: number,
    @Body() body: { scope?: 'all' | 'locations' | 'property-types' | 'features' },
  ) {
    const scope = body?.scope || 'all';

    if (scope === 'locations') {
      return { locations: await this.enrichmentService.enrichLocations(tenantId) };
    }
    if (scope === 'property-types') {
      return { propertyTypes: await this.enrichmentService.enrichPropertyTypes(tenantId) };
    }
    if (scope === 'features') {
      return { features: await this.enrichmentService.enrichFeatures(tenantId) };
    }
    return this.enrichmentService.enrichAll(tenantId);
  }
}
