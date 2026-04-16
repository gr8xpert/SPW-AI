import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { EmailCampaignService } from './email-campaign.service';
import {
  CreateEmailConfigDto,
  UpdateEmailConfigDto,
  CreateTemplateDto,
  UpdateTemplateDto,
  CreateCampaignDto,
  UpdateCampaignDto,
} from './dto';
import { CurrentTenant } from '../../common/decorators';

@Controller('api/dashboard/email-config')
export class EmailConfigController {
  constructor(private readonly service: EmailCampaignService) {}

  @Get()
  getConfig(@CurrentTenant() tenantId: number) {
    return this.service.getConfig(tenantId);
  }

  @Put()
  updateConfig(
    @CurrentTenant() tenantId: number,
    @Body() dto: CreateEmailConfigDto | UpdateEmailConfigDto,
  ) {
    return this.service.createOrUpdateConfig(tenantId, dto);
  }

  @Post('test')
  testConfig(@CurrentTenant() tenantId: number) {
    return this.service.testConfig(tenantId);
  }
}

@Controller('api/dashboard/email-templates')
export class EmailTemplateController {
  constructor(private readonly service: EmailCampaignService) {}

  @Post()
  create(
    @CurrentTenant() tenantId: number,
    @Body() dto: CreateTemplateDto,
  ) {
    return this.service.createTemplate(tenantId, dto);
  }

  @Get()
  findAll(@CurrentTenant() tenantId: number) {
    return this.service.findAllTemplates(tenantId);
  }

  @Get(':id')
  findOne(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.findTemplate(tenantId, id);
  }

  @Put(':id')
  update(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.service.updateTemplate(tenantId, id, dto);
  }

  @Delete(':id')
  delete(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.deleteTemplate(tenantId, id);
  }

  @Post(':id/preview')
  preview(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Record<string, any>,
  ) {
    return this.service.previewTemplate(tenantId, id, data);
  }
}

@Controller('api/dashboard/campaigns')
export class CampaignController {
  constructor(private readonly service: EmailCampaignService) {}

  @Post()
  create(
    @CurrentTenant() tenantId: number,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.service.createCampaign(tenantId, dto);
  }

  @Get()
  findAll(@CurrentTenant() tenantId: number) {
    return this.service.findAllCampaigns(tenantId);
  }

  @Get(':id')
  findOne(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.findCampaign(tenantId, id);
  }

  @Put(':id')
  update(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.service.updateCampaign(tenantId, id, dto);
  }

  @Post(':id/send')
  start(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.startCampaign(tenantId, id);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.cancelCampaign(tenantId, id);
  }

  @Get(':id/stats')
  getStats(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.getCampaignStats(tenantId, id);
  }
}
