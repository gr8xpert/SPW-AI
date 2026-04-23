import { Controller, Post, Get, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { TranslationService } from './translation.service';
import { AiService } from '../ai/ai.service';
import { TranslatePropertyDto, BulkTranslateDto, TranslateEntityDto } from './dto/translate-property.dto';
import { JwtAuthGuard, TenantGuard } from '../../common/guards';
import { CurrentTenant } from '../../common/decorators';

@Controller('api/dashboard/translate')
@UseGuards(JwtAuthGuard, TenantGuard)
export class TranslationController {
  constructor(
    private readonly translationService: TranslationService,
    private readonly aiService: AiService,
  ) {}

  @Post('test')
  async testConnection(@CurrentTenant() tenantId: number) {
    return this.aiService.testConnection(tenantId);
  }

  // Property translations
  @Post('property/:id')
  async translateProperty(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TranslatePropertyDto,
  ) {
    return this.translationService.translateProperty(
      tenantId, id, dto.targetLanguages, dto.sourceLanguage,
    );
  }

  @Post('properties/bulk')
  async bulkTranslateProperties(
    @CurrentTenant() tenantId: number,
    @Body() dto: BulkTranslateDto,
  ) {
    return this.translationService.bulkTranslate(
      tenantId, dto.targetLanguages, dto.sourceLanguage, dto.propertyIds,
    );
  }

  // Property type translations
  @Post('property-type/:id')
  async translatePropertyType(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TranslateEntityDto,
  ) {
    return this.translationService.translatePropertyType(
      tenantId, id, dto.targetLanguages, dto.sourceLanguage,
    );
  }

  @Post('property-types/bulk')
  async bulkTranslatePropertyTypes(
    @CurrentTenant() tenantId: number,
    @Body() dto: TranslateEntityDto,
  ) {
    return this.translationService.bulkTranslateEntity(
      tenantId, 'propertyType', dto.targetLanguages, dto.sourceLanguage,
    );
  }

  // Feature translations
  @Post('feature/:id')
  async translateFeature(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TranslateEntityDto,
  ) {
    return this.translationService.translateFeature(
      tenantId, id, dto.targetLanguages, dto.sourceLanguage,
    );
  }

  @Post('features/bulk')
  async bulkTranslateFeatures(
    @CurrentTenant() tenantId: number,
    @Body() dto: TranslateEntityDto,
  ) {
    return this.translationService.bulkTranslateEntity(
      tenantId, 'feature', dto.targetLanguages, dto.sourceLanguage,
    );
  }

  // Label translations
  @Post('label/:id')
  async translateLabel(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TranslateEntityDto,
  ) {
    return this.translationService.translateLabel(
      tenantId, id, dto.targetLanguages, dto.sourceLanguage,
    );
  }

  @Post('labels/bulk')
  async bulkTranslateLabels(
    @CurrentTenant() tenantId: number,
    @Body() dto: TranslateEntityDto,
  ) {
    return this.translationService.bulkTranslateEntity(
      tenantId, 'label', dto.targetLanguages, dto.sourceLanguage,
    );
  }

  // Job status
  @Get('job/:jobId')
  async getJobStatus(@Param('jobId') jobId: string) {
    const status = await this.translationService.getJobStatus(jobId);
    if (!status) {
      return { jobId, status: 'not_found' };
    }
    return status;
  }
}
