import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AiSeoService } from './ai-seo.service';
import { GenerateSeoDto } from './dto/generate-seo.dto';
import { BulkGenerateSeoDto } from './dto/bulk-generate-seo.dto';
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

  // Queues a catalog-wide pass. Returns immediately with a job id — poll
  // job/:jobId for progress, same contract as bulk translate.
  @Post('properties/bulk')
  async bulkGenerate(
    @CurrentTenant() tenantId: number,
    @Body() dto: BulkGenerateSeoDto,
  ) {
    return this.aiSeoService.bulkGenerate(tenantId, dto);
  }

  // The tenant's in-flight bulk run, if any — lets the dashboard resume its
  // progress indicator after a refresh instead of offering a fresh start.
  @Get('jobs/active')
  async getActiveJob(@CurrentTenant() tenantId: number) {
    return { job: await this.aiSeoService.findActiveJob(tenantId) };
  }

  @Get('job/:jobId')
  async getJobStatus(@CurrentTenant() tenantId: number, @Param('jobId') jobId: string) {
    const status = await this.aiSeoService.getJobStatus(jobId, tenantId);
    if (!status) throw new NotFoundException('Job not found');
    return status;
  }
}
