import { Controller, Post, UseGuards, Body } from '@nestjs/common';
import { AiEnrichmentService } from './ai-enrichment.service';
import { TenantService } from '../tenant/tenant.service';
import { JwtAuthGuard, TenantGuard } from '../../common/guards';
import { CurrentTenant } from '../../common/decorators';

type EnrichmentScope = 'all' | 'locations' | 'property-types' | 'features';

@Controller('api/dashboard/ai-enrichment')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AiEnrichmentController {
  // Runs in flight, keyed by tenant + scope. The run keeps going server-side
  // when the user refreshes or navigates away, so a second click must join it
  // rather than start another pass that pays for the same AI calls again.
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly enrichmentService: AiEnrichmentService,
    private readonly tenantService: TenantService,
  ) {}

  // Manual trigger from the dashboard "✨ AI organize" buttons.
  // Body.scope picks a subset (defaults to all three).
  @Post('run')
  async run(
    @CurrentTenant() tenantId: number,
    @Body() body: { scope?: EnrichmentScope },
  ) {
    const scope = body?.scope || 'all';
    const key = `${tenantId}:${scope}`;

    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const run = this.execute(tenantId, scope).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, run);
    return run;
  }

  // AI Organize re-parents, merges and re-categorises public rows, so the run
  // ends with one syncVersion bump — after all three passes, not per row (the
  // merges go through LocationService/PropertyTypeService, which don't bump).
  // A run that moved nothing skips it; one that threw part-way may have
  // written some rows already, so it bumps to be safe.
  private async execute(tenantId: number, scope: EnrichmentScope) {
    let result: object | undefined;
    try {
      const out = await this.organize(tenantId, scope);
      result = out;
      return out;
    } finally {
      if (!result || changedRows(result) > 0) {
        await this.tenantService.bumpSyncVersionSafely(tenantId, `AI organize (${scope})`);
      }
    }
  }

  private async organize(tenantId: number, scope: EnrichmentScope) {
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

// Every counter in the result except the "skipped" ones is a row written.
function changedRows(result: object): number {
  let total = 0;
  for (const section of Object.values(result)) {
    if (!section || typeof section !== 'object' || Array.isArray(section)) continue;
    for (const [key, value] of Object.entries(section)) {
      if (key !== 'skipped' && typeof value === 'number') total += value;
    }
  }
  return total;
}
