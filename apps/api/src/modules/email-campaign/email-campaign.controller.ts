import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EmailCampaignService } from './email-campaign.service';
import { CampaignContentService } from './campaign-content.service';
import {
  CreateEmailConfigDto,
  UpdateEmailConfigDto,
  CreateTemplateDto,
  UpdateTemplateDto,
  CreateCampaignDto,
  UpdateCampaignDto,
  ScheduleCampaignDto,
  TestCampaignDto,
  CampaignRecipientsQueryDto,
  RecipientCountDto,
  RenderPreviewDto,
} from './dto';
import { CurrentTenant, RequiresAddon } from '../../common/decorators';
import { JwtAuthGuard, TenantGuard, DashboardAddonGuard } from '../../common/guards';

@Controller('api/dashboard/email-config')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard)
@RequiresAddon('emailCampaign')
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
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard)
@RequiresAddon('emailCampaign')
export class EmailTemplateController {
  constructor(
    private readonly service: EmailCampaignService,
    private readonly content: CampaignContentService,
  ) {}

  @Post('render-preview')
  renderPreview(@CurrentTenant() tenantId: number, @Body() dto: RenderPreviewDto) {
    return this.content.previewSample(tenantId, { subject: dto.subject ?? '', bodyHtml: dto.bodyHtml });
  }

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
  ) {
    return this.service.previewTemplate(tenantId, id);
  }
}

@Controller('api/dashboard/campaigns')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard)
@RequiresAddon('emailCampaign')
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

  // The subscriber tags, for picking a campaign's audience.
  @Get('tags')
  tags(@CurrentTenant() tenantId: number) {
    return this.service.listTags(tenantId);
  }

  // How many subscribed contacts a recipient filter reaches.
  @Post('recipient-count')
  recipientCount(
    @CurrentTenant() tenantId: number,
    @Body() dto: RecipientCountDto,
  ) {
    return this.service.countForFilter(tenantId, dto.recipientFilter);
  }

  @Get(':id')
  findOne(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.getCampaignDetail(tenantId, id);
  }

  @Delete(':id')
  remove(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.deleteCampaign(tenantId, id);
  }

  @Post(':id/duplicate')
  duplicate(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.duplicateCampaign(tenantId, id);
  }

  @Post(':id/schedule')
  schedule(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ScheduleCampaignDto,
  ) {
    return this.service.scheduleCampaign(tenantId, id, dto.scheduledAt);
  }

  @Post(':id/test')
  test(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TestCampaignDto,
  ) {
    return this.service.sendTest(tenantId, id, dto.email);
  }

  @Get(':id/preview')
  preview(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.previewCampaign(tenantId, id);
  }

  @Get(':id/recipients')
  recipients(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: CampaignRecipientsQueryDto,
  ) {
    return this.service.listRecipients(tenantId, id, query.page ?? 1, query.limit ?? 25, query.status);
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
